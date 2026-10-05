import type { LatLon } from "../types";

/**
 * The app is scoped to Toronto and the GTA (Halton to Durham, lakeshore to Lake
 * Simcoe's south shore). Search, autocomplete and map panning stay inside this box.
 */
export const REGION = {
  name: "Toronto & the GTA",
  south: 43.25,
  west: -80.3,
  north: 44.45,
  east: -78.55,
  center: { lat: 43.6532, lon: -79.3832 },
  zoom: 11,
};

export function inRegion(p: LatLon): boolean {
  return p.lat >= REGION.south && p.lat <= REGION.north && p.lon >= REGION.west && p.lon <= REGION.east;
}

/** `minLon,minLat,maxLon,maxLat`, as Photon's `bbox` and Nominatim's `viewbox` expect. */
export const REGION_BBOX = [REGION.west, REGION.south, REGION.east, REGION.north].join(",");
