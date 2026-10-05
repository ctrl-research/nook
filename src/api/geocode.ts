import type { LatLon, Place } from "../types";
import { fetchJson, Pacer } from "./http";
import { DAY } from "./persistentCache";
import { REGION_BBOX } from "../config/region";

// Photon allows type-ahead use; Nominatim's policy forbids autocomplete, so it is
// only used for explicitly submitted searches (max 1 req/s).
const PHOTON = "https://photon.komoot.io/api/";
const NOMINATIM = "https://nominatim.openstreetmap.org";
export const nominatimPacer = new Pacer(1100);

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
}

function photonToPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const primary = p.name ?? (street || p.city || "Unnamed place");
  const detail = [p.name ? street : "", p.city ?? p.county, p.state, p.country]
    .filter((s) => s && s !== primary)
    .join(", ");
  const [lon, lat] = f.geometry.coordinates;
  return { lat, lon, name: primary, detail };
}

/** Address / place autocomplete within the GTA, biased towards `near` when given. */
export async function searchAddress(query: string, near?: LatLon, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, limit: "6", bbox: REGION_BBOX });
  if (near) {
    params.set("lat", near.lat.toFixed(5));
    params.set("lon", near.lon.toFixed(5));
  }
  // Uncached so a newer keystroke really cancels the previous (slow) request.
  const data = await fetchJson<{ features: PhotonFeature[] }>(`${PHOTON}?${params}`, {
    signal,
    timeoutMs: 15_000,
    cache: false,
  });
  // OSM often has several ways with the same name (e.g. segments of one path).
  const seen = new Set<string>();
  return data.features.map(photonToPlace).filter((p) => {
    const key = `${p.name}|${p.detail}`;
    return !seen.has(key) && seen.add(key);
  });
}

interface NominatimSearch {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
}

/** One-off search for an explicitly submitted query (Enter), when autocomplete isn't helping. */
export async function searchAddressOnce(query: string): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "6", viewbox: REGION_BBOX, bounded: "1" });
  const r = await fetchJson<NominatimSearch[]>(`${NOMINATIM}/search?${params}`, {
    pacer: nominatimPacer,
    persistMs: 30 * DAY,
  });
  return r.map((x) => {
    const parts = x.display_name.split(",").map((s) => s.trim());
    return { lat: Number(x.lat), lon: Number(x.lon), name: x.name || parts[0], detail: parts.slice(1, 4).join(", ") };
  });
}
