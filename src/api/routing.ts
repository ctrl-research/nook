import type { LatLon, Trip, TripResult } from "../types";
import { decodePolyline } from "../lib/geo";
import { fetchJson, Pacer } from "./http";
import { DAY, readCached, writeCached } from "./persistentCache";

/**
 * Walk and car times via FOSSGIS's public Valhalla server. (Their OSRM server,
 * used before, now delays every request after the first by ~8–10s and rejects
 * overlapping ones; Valhalla answers in ~0.35s.) Fair-use policy: 1 request/s
 * per user, so all calls share one pacer and matrix lookups are batched.
 */
const VALHALLA = "https://valhalla1.openstreetmap.de";
const COSTING = { walk: "pedestrian", car: "auto" } as const;
export type StreetMode = keyof typeof COSTING;

const pacer = new Pacer(1000);
const coord = (p: LatLon) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`;
const point = (p: LatLon) => ({ lat: Number(p.lat.toFixed(6)), lon: Number(p.lon.toFixed(6)) });
/** GET with a `json` parameter avoids a CORS preflight for every call. */
const url = (endpoint: string, body: unknown) => `${VALHALLA}/${endpoint}?${new URLSearchParams({ json: JSON.stringify(body) })}`;

interface MatrixResponse {
  sources_to_targets?: { time: number | null; distance: number | null }[][];
  error?: string;
}

/** Valhalla's default matrix limit is 50 locations. */
const MAX_PER_TABLE = 40;
const CACHE_MS = 7 * DAY;

interface Pending {
  dest: LatLon;
  key: string;
  resolve: (r: TripResult) => void;
}

/**
 * Coalesces walk/car time lookups into as few matrix requests as possible: one
 * request per mode is in flight at a time, and destinations queued meanwhile go
 * out together in the next one. Each origin→destination time is also cached on
 * its own, so reloads and newly added places only route what isn't known yet.
 */
export class TableBatcher {
  private queues = new Map<string, { origin: LatLon; pending: Pending[] }>();
  private memo = new Map<string, Promise<TripResult>>();
  private running = false;

  constructor(
    private readonly mode: StreetMode,
    private readonly gatherMs = 30,
  ) {}

  request(origin: LatLon, dest: LatLon): Promise<TripResult> {
    const key = `valhalla-${this.mode} ${coord(origin)} ${coord(dest)}`;
    const known = this.memo.get(key);
    if (known) return known;
    const promise = readCached<TripResult>(key).then(
      (hit) =>
        hit ??
        new Promise<TripResult>((resolve) => {
          const originKey = coord(origin);
          const queue = this.queues.get(originKey) ?? { origin, pending: [] };
          queue.pending.push({ dest, key, resolve });
          this.queues.set(originKey, queue);
          void this.pump();
        }),
    );
    this.memo.set(key, promise);
    // Don't keep failures around; a later request should retry.
    void promise.then((r) => r.status === "error" && this.memo.delete(key));
    return promise;
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Let callers that start at the same moment join the first batch.
      await new Promise((r) => setTimeout(r, this.gatherMs));
      for (let next = this.takeBatch(); next; next = this.takeBatch()) {
        await this.send(next.origin, next.batch);
      }
    } finally {
      this.running = false;
    }
  }

  private takeBatch(): { origin: LatLon; batch: Pending[] } | null {
    for (const [key, queue] of this.queues) {
      const batch = queue.pending.splice(0, MAX_PER_TABLE);
      if (!queue.pending.length) this.queues.delete(key);
      if (batch.length) return { origin: queue.origin, batch };
    }
    return null;
  }

  private async send(origin: LatLon, batch: Pending[]): Promise<void> {
    const body = { sources: [point(origin)], targets: batch.map((p) => point(p.dest)), costing: COSTING[this.mode] };
    try {
      const r = await fetchJson<MatrixResponse>(url("sources_to_targets", body), {
        pacer,
        cache: false,
        accept: (d) => !!d.sources_to_targets,
      });
      batch.forEach((p, i) => {
        const cell = r.sources_to_targets![0][i];
        const result: TripResult =
          cell?.time == null
            ? { status: "none", reason: "No route" }
            : { status: "ok", trip: { seconds: cell.time, meters: cell.distance == null ? undefined : cell.distance * 1000 } };
        void writeCached(p.key, result, CACHE_MS);
        p.resolve(result);
      });
    } catch (e) {
      const reason = `Routing failed: ${e instanceof Error ? e.message : e}`;
      batch.forEach((p) => p.resolve({ status: "error", reason }));
    }
  }
}

const batchers: Record<StreetMode, TableBatcher> = { car: new TableBatcher("car"), walk: new TableBatcher("walk") };

/** Travel time/distance from `origin` to each of `destinations` (batched; see TableBatcher). */
export function streetTable(mode: StreetMode, origin: LatLon, destinations: LatLon[]): Promise<TripResult[]> {
  return Promise.all(destinations.map((d) => batchers[mode].request(origin, d)));
}

interface RouteResponse {
  trip?: { summary: { time: number; length: number }; legs: { shape: string }[] };
}

/** Full route with geometry, fetched lazily when a row is selected. */
export async function streetRoute(mode: StreetMode, origin: LatLon, dest: LatLon): Promise<Trip | null> {
  const body = {
    locations: [point(origin), point(dest)],
    costing: COSTING[mode],
    directions_options: { units: "kilometers" },
  };
  const r = await fetchJson<RouteResponse>(url("route", body), { pacer, persistMs: 7 * DAY, accept: (d) => !!d.trip });
  const trip = r.trip;
  if (!trip) return null;
  return {
    seconds: trip.summary.time,
    meters: trip.summary.length * 1000,
    // Valhalla encodes shapes with 6-digit precision.
    path: [{ points: trip.legs.flatMap((l) => decodePolyline(l.shape, 6)), dashed: mode === "walk" }],
  };
}
