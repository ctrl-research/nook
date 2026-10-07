import type { Place } from "../types";
import { REGION } from "../config/region";
import { fetchJson, HttpError } from "./http";
import { DAY } from "./persistentCache";

/**
 * Address suggestions while typing, via Geoapify (free tier: 3,000 requests/day,
 * commercial use allowed). Optional: with no key, or once the key is rejected or
 * over quota, suggestions switch off and search works on submit only (Nominatim).
 */
const ENDPOINT = "https://api.geoapify.com/v1/geocode/autocomplete";
const KEY = import.meta.env.VITE_GEOAPIFY_KEY?.trim() || "";

let disabledReason: string | null = KEY ? null : "no key configured";

export function autocompleteEnabled(): boolean {
  return disabledReason === null;
}

export interface GeoapifyResult {
  lat: number;
  lon: number;
  name?: string;
  address_line1?: string;
  address_line2?: string;
  formatted?: string;
}

/** "100 Queen Street West" over "Toronto, ON M5H 2N2" (the country is implied). */
export function toPlace(r: GeoapifyResult): Place {
  const name = r.address_line1 || r.name || r.formatted?.split(",")[0] || "Unnamed place";
  const detail = r.address_line2?.replace(/,\s*Canada$/, "");
  return { lat: r.lat, lon: r.lon, name, detail: detail || undefined };
}

export function buildUrl(query: string, key: string): string {
  const params = new URLSearchParams({
    text: query,
    filter: `rect:${REGION.west},${REGION.south},${REGION.east},${REGION.north}`,
    bias: `proximity:${REGION.center.lon},${REGION.center.lat}`,
    limit: "6",
    lang: "en",
    format: "json",
    apiKey: key,
  });
  return `${ENDPOINT}?${params}`;
}

/** Suggestions for a partial address; [] when switched off. Aborts with `signal`. */
export async function suggestAddresses(query: string, signal?: AbortSignal): Promise<Place[]> {
  if (!autocompleteEnabled()) return [];
  try {
    const data = await fetchJson<{ results?: GeoapifyResult[] }>(buildUrl(query, KEY), {
      signal,
      timeoutMs: 5000,
      // Uncached in memory so a newer keystroke can cancel this request, but kept
      // in the browser so retyping the same text doesn't spend quota.
      cache: false,
      persistMs: 7 * DAY,
      accept: (d) => Array.isArray(d.results),
    });
    const seen = new Set<string>();
    return (data.results ?? []).map(toPlace).filter((p) => {
      const key = `${p.name}|${p.detail}`;
      return !seen.has(key) && seen.add(key);
    });
  } catch (e) {
    // Bad key, origin not allowed, or out of quota: stop trying for this session.
    if (e instanceof HttpError && (e.status === 401 || e.status === 403 || e.status === 429)) {
      disabledReason = `Geoapify responded ${e.status}`;
      console.warn(`[nook] address suggestions disabled: ${disabledReason}`);
      return [];
    }
    throw e;
  }
}
