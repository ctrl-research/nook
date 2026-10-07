import type { Category, LatLon, Place } from "../types";
import { bboxAround, haversine } from "../lib/geo";
import { parseTagSpec } from "../lib/tags";
import { fetchJson } from "./http";
import { DAY } from "./persistentCache";
import { nominatimPacer } from "./geocode";

export interface Candidate extends Place {
  distanceM: number;
}

export type CandidateResult = { ok: true; candidates: Candidate[] } | { ok: false; reason: string };

/** Search boxes, widened only until enough matches are found. */
const RADII_M = [1500, 5000, 15_000, 30_000];

/** Options shown per category at most at first, and added per "show more". */
export const PAGE_SIZE = 6;

interface NominatimResult {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
}

/**
 * Nominatim `[key=value]` searches for a category's tags. Bare keys can't be
 * searched this way, so they're skipped (and flagged in the category editor).
 */
export function searchPhrases(category: Category): string[] {
  return category.tags.flatMap((t) => {
    const spec = parseTagSpec(t);
    return spec?.values ? spec.values.map((v) => `[${spec.key}=${v}]`) : [];
  });
}

function nearest(candidates: Candidate[], n: number): Candidate[] {
  const seen = new Set<string>();
  return [...candidates]
    .sort((a, b) => a.distanceM - b.distanceM)
    .filter((c) => {
      const key = `${c.lat.toFixed(5)},${c.lon.toFixed(5)}`;
      return !seen.has(key) && seen.add(key);
    })
    .slice(0, n);
}

/**
 * Nearby places for one category via Nominatim's special-phrase search, bounded
 * to a box around the origin and widened until at least `min` are found. (The
 * public Overpass servers were too slow or down to rely on: 10–25s per query.)
 * Results inside a box are ranked by importance rather than distance, so boxes
 * start small to keep the nearest in the 40-result window. Paced to 1 req/s.
 *
 * Returns up to `max` matches, nearest first.
 */
export async function findPlaces(
  origin: LatLon,
  category: Category,
  { min = 1, max = PAGE_SIZE, signal }: { min?: number; max?: number; signal?: AbortSignal } = {},
): Promise<CandidateResult> {
  const phrases = searchPhrases(category);
  if (!phrases.length) return { ok: false, reason: "No searchable tags (use key=value)" };
  let best: Candidate[] = [];
  try {
    for (const radius of RADII_M) {
      const viewbox = bboxAround(origin, radius).map((n) => n.toFixed(5)).join(",");
      const results = await Promise.all(
        phrases.map((q) => {
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
        return { lat, lon, name: r.name || category.label, detail, distanceM: haversine(origin, { lat, lon }) };
      });
      // A wider box returns a superset, so the latest result replaces the last.
      best = nearest(candidates, max);
      if (best.length >= min) break;
    }
  } catch (e) {
    return { ok: false, reason: `Place search failed: ${e instanceof Error ? e.message : e}` };
  }
  return best.length ? { ok: true, candidates: best } : { ok: false, reason: `None within ${RADII_M.at(-1)! / 1000} km` };
}
