import type { LatLon, Trip, TripResult } from "../types";
import { fetchJson, Pacer } from "./http";
import { DAY } from "./persistentCache";

/** FOSSGIS-hosted OSRM, which (unlike the OSRM demo server) has car and foot profiles. */
const OSRM_BASE = {
  car: "https://routing.openstreetmap.de/routed-car",
  walk: "https://routing.openstreetmap.de/routed-foot",
} as const;
export type StreetMode = keyof typeof OSRM_BASE;

const pacer = new Pacer(250);
const coord = (p: LatLon) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`;

interface TableResponse {
  code: string;
  message?: string;
  durations?: (number | null)[][];
  distances?: (number | null)[][];
}

/** Travel time/distance from `origin` to each of `destinations`, in one request. */
export async function streetTable(mode: StreetMode, origin: LatLon, destinations: LatLon[]): Promise<TripResult[]> {
  if (!destinations.length) return [];
  const coords = [origin, ...destinations].map(coord).join(";");
  const url = `${OSRM_BASE[mode]}/table/v1/driving/${coords}?sources=0&annotations=duration,distance`;
  try {
    const r = await fetchJson<TableResponse>(url, { pacer, persistMs: 7 * DAY, accept: (d) => d.code === "Ok" });
    if (r.code !== "Ok" || !r.durations) throw new Error(r.message ?? r.code);
    return destinations.map((_, i): TripResult => {
      const seconds = r.durations![0][i + 1];
      const meters = r.distances?.[0][i + 1] ?? undefined;
      return seconds === null ? { status: "none", reason: "No route" } : { status: "ok", trip: { seconds, meters } };
    });
  } catch (e) {
    const reason = `Routing failed: ${e instanceof Error ? e.message : e}`;
    return destinations.map(() => ({ status: "error", reason }));
  }
}

interface RouteResponse {
  code: string;
  routes?: { duration: number; distance: number; geometry: { coordinates: [number, number][] } }[];
}

/** Full route with geometry, fetched lazily when a row is selected. */
export async function streetRoute(mode: StreetMode, origin: LatLon, dest: LatLon): Promise<Trip | null> {
  const url = `${OSRM_BASE[mode]}/route/v1/driving/${coord(origin)};${coord(dest)}?overview=full&geometries=geojson`;
  const r = await fetchJson<RouteResponse>(url, { pacer, persistMs: 7 * DAY, accept: (d) => d.code === "Ok" });
  const route = r.routes?.[0];
  if (!route) return null;
  return {
    seconds: route.duration,
    meters: route.distance,
    path: [{ points: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]), dashed: mode === "walk" }],
  };
}
