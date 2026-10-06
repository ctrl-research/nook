import type { Place } from "../types";
import { fetchJson, Pacer } from "./http";
import { DAY } from "./persistentCache";
import { REGION_BBOX } from "../config/region";

/**
 * Address search via Nominatim, run only when the user submits (Enter / Search):
 * its usage policy forbids search-as-you-type, and the public type-ahead
 * alternative (Photon) became too slow (20s+) to be usable. Max 1 req/s.
 */
const NOMINATIM = "https://nominatim.openstreetmap.org";
export const nominatimPacer = new Pacer(1100);

export interface NominatimSearchResult {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string>;
}

/** "Toronto City Hall" over "100 Queen Street West, Toronto", or "100 Queen Street West" over "Toronto". */
export function toPlace(r: NominatimSearchResult): Place {
  const a = r.address ?? {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const locality = a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb;
  const name = r.name || street || r.display_name.split(",")[0].trim();
  const detail = [r.name ? street : "", locality].filter(Boolean).join(", ");
  return { lat: Number(r.lat), lon: Number(r.lon), name, detail: detail || undefined };
}

/** Address / place search within the GTA. */
export async function searchAddress(query: string): Promise<Place[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "8",
    viewbox: REGION_BBOX,
    bounded: "1",
  });
  const results = await fetchJson<NominatimSearchResult[]>(`${NOMINATIM}/search?${params}`, {
    pacer: nominatimPacer,
    persistMs: 30 * DAY,
  });
  // OSM often has several objects for one spot (e.g. a building and its address).
  const seen = new Set<string>();
  return results.map(toPlace).filter((p) => {
    const key = `${p.name}|${p.detail}`;
    return !seen.has(key) && seen.add(key);
  });
}
