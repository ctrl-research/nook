import type { Category, LatLon, Place } from "../types";
import { bboxAround, haversine } from "../lib/geo";
import { matchesTags, parseTagSpec, toOverpassFilter, type TagSpec } from "../lib/tags";
import { fetchJson, HttpError } from "./http";
import { DAY, readCached } from "./persistentCache";
import { nominatimPacer } from "./geocode";

export interface Candidate extends Place {
  distanceM: number;
}

export type CandidateResult = { ok: true; candidates: Candidate[] } | { ok: false; reason: string };

/** Search radii, widened only for categories without enough matches yet. */
const RADII_M = [1500, 5000, 15_000, 30_000];

/** Options fetched per category at first, and per "show more". */
export const PAGE_SIZE = 6;

// Public Overpass instances are community-run and often overloaded, so rotate.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
let preferredEndpoint = 0;
/** After every server fails, skip Overpass for a while instead of waiting on timeouts again. */
const OVERPASS_COOLDOWN_MS = 3 * 60_000;
let overpassDownUntil = 0;

interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface Parsed {
  category: Category;
  specs: TagSpec[];
}

function parseCategory(category: Category): Parsed {
  return { category, specs: category.tags.map(parseTagSpec).filter((t): t is TagSpec => t !== null) };
}

export function buildOverpassQuery(origin: LatLon, radiusM: number, specs: TagSpec[]): string {
  const around = `(around:${radiusM},${origin.lat.toFixed(6)},${origin.lon.toFixed(6)})`;
  const clauses = specs.map((t) => `nwr${toOverpassFilter(t)}${around};`).join("");
  return `[out:json][timeout:25];(${clauses});out center tags;`;
}

async function overpass(query: string): Promise<OverpassElement[]> {
  const cacheKey = `overpass ${query}`;
  if (Date.now() < overpassDownUntil) {
    // While the servers are down, a stored answer is still good.
    const stored = await readCached<{ elements?: OverpassElement[] }>(cacheKey);
    if (stored?.elements) return stored.elements;
    throw new HttpError("Overpass recently unavailable; skipping");
  }
  const errors: string[] = [];
  for (let attempt = 0; attempt < OVERPASS_ENDPOINTS.length; attempt++) {
    const i = (preferredEndpoint + attempt) % OVERPASS_ENDPOINTS.length;
    const url = OVERPASS_ENDPOINTS[i];
    try {
      const data = await fetchJson<{ elements?: OverpassElement[]; remark?: string }>(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }).toString(),
        timeoutMs: 8_000,
        // Keyed on the query, not the server, so any instance's answer is reused.
        cacheKey,
        persistMs: 7 * DAY,
        accept: (d) => !!d.elements && !(d.remark && /error/i.test(d.remark)),
      });
      preferredEndpoint = i;
      return data.elements ?? [];
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  overpassDownUntil = Date.now() + OVERPASS_COOLDOWN_MS;
  throw new HttpError(`All Overpass servers failed (${errors.join("; ")})`);
}

function toCandidate(el: OverpassElement, category: Category, origin: LatLon): Candidate | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const t = el.tags ?? {};
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  return {
    lat,
    lon,
    name: t.name ?? t.brand ?? category.label,
    detail: street || undefined,
    distanceM: haversine(origin, { lat, lon }),
  };
}

function nearest(candidates: Candidate[], n: number): Candidate[] {
  return [...candidates].sort((a, b) => a.distanceM - b.distanceM).slice(0, n);
}

/**
 * Widens the search radius step by step. If Overpass fails part-way, whatever
 * was found is kept and the unresolved categories are returned with the error.
 */
async function viaOverpass(origin: LatLon, parsed: Parsed[], perCategory: number) {
  const found = new Map<string, Candidate[]>();
  let remaining = parsed;
  for (const radius of RADII_M) {
    if (!remaining.length) break;
    let elements: OverpassElement[];
    try {
      elements = await overpass(buildOverpassQuery(origin, radius, remaining.flatMap((p) => p.specs)));
    } catch (error) {
      return { found, unresolved: remaining, error };
    }
    for (const p of remaining) {
      const matches = elements
        .filter((el) => p.specs.some((s) => matchesTags(s, el.tags)))
        .map((el) => toCandidate(el, p.category, origin))
        .filter((c): c is Candidate => c !== null);
      // A wider radius returns a superset, so the latest result replaces the last.
      if (matches.length) found.set(p.category.id, nearest(matches, perCategory));
    }
    remaining = remaining.filter((p) => (found.get(p.category.id)?.length ?? 0) < perCategory);
  }
  return { found, unresolved: [] as Parsed[], error: null };
}

interface NominatimResult {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
}

/**
 * Fallback when Overpass is down: Nominatim's `[key=value]` special-phrase
 * search, bounded to a box around the origin. Results are ranked by importance,
 * not distance, so start small to keep the nearest ones in the 40-result window.
 * Paced to 1 req/s per its policy.
 */
async function viaNominatim(origin: LatLon, p: Parsed, perCategory: number, signal?: AbortSignal): Promise<Candidate[]> {
  const pairs = p.specs.flatMap((s) => (s.values ?? []).map((v) => `[${s.key}=${v}]`));
  let best: Candidate[] = [];
  for (const radius of RADII_M) {
    const viewbox = bboxAround(origin, radius).map((n) => n.toFixed(5)).join(",");
    const results = await Promise.all(
      pairs.map((q) => {
        const params = new URLSearchParams({ q, format: "jsonv2", limit: "40", viewbox, bounded: "1" });
        return fetchJson<NominatimResult[]>(`https://nominatim.openstreetmap.org/search?${params}`, {
          pacer: nominatimPacer,
          signal,
          persistMs: 7 * DAY,
        });
      }),
    );
    const candidates = results.flat().map((r) => {
      const lat = Number(r.lat);
      const lon = Number(r.lon);
      const detail = r.display_name.split(",").slice(1, 3).join(",").trim();
      return { lat, lon, name: r.name || p.category.label, detail, distanceM: haversine(origin, { lat, lon }) };
    });
    best = nearest(candidates, perCategory);
    if (best.length >= perCategory) break;
  }
  return best;
}

/**
 * Finds the `perCategory` closest (straight-line) matches for each category.
 * Categories with a `fixed` place should be filtered out by the caller.
 * Results are keyed by category id.
 */
export async function findCandidates(
  origin: LatLon,
  categories: Category[],
  perCategory = PAGE_SIZE,
  signal?: AbortSignal,
): Promise<Map<string, CandidateResult>> {
  const parsed = categories.map(parseCategory);
  const out = new Map<string, CandidateResult>();
  for (const p of parsed) {
    if (!p.specs.length) out.set(p.category.id, { ok: false, reason: "No valid tags (use key=value)" });
  }
  const searchable = parsed.filter((p) => p.specs.length);

  const { found, unresolved, error } = await viaOverpass(origin, searchable, perCategory);
  if (error) {
    console.warn("[nook] Overpass unavailable, falling back to Nominatim", error);
    // Requests are paced globally, so starting all categories at once just keeps the queue full.
    await Promise.all(
      unresolved.map(async (p) => {
        try {
          found.set(p.category.id, await viaNominatim(origin, p, perCategory, signal));
        } catch (e) {
          out.set(p.category.id, { ok: false, reason: `Place search failed: ${e instanceof Error ? e.message : e}` });
        }
      }),
    );
  }

  const maxKm = RADII_M[RADII_M.length - 1] / 1000;
  for (const p of searchable) {
    if (out.has(p.category.id)) continue;
    const c = found.get(p.category.id);
    out.set(p.category.id, c?.length ? { ok: true, candidates: c } : { ok: false, reason: `None within ${maxKm} km` });
  }
  return out;
}
