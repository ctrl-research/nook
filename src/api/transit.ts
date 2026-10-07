import type { LatLon, Trip, TripResult } from "../types";
import { decodePolyline } from "../lib/geo";
import { fetchJson, Limiter } from "./http";
import { HOUR } from "./persistentCache";

/** Transitous: free, community-run MOTIS instance aggregating public GTFS feeds. */
const TRANSITOUS = "https://api.transitous.org/api/v1/plan";

export interface MotisLeg {
  mode: string;
  duration: number;
  startTime: string;
  endTime: string;
  displayName?: string;
  routeShortName?: string;
  routeColor?: string;
  legGeometry?: { points: string; precision: number };
}

export interface MotisItinerary {
  duration: number;
  startTime: string;
  endTime: string;
  transfers: number;
  legs: MotisLeg[];
}

export const WALK_ONLY = "Walking is quicker than transit";

const isTransit = (l: MotisLeg) => !["WALK", "BIKE", "CAR", "RENTAL", "FLEX"].includes(l.mode);

/**
 * Door-to-door time excluding the initial wait at home: MOTIS itineraries start
 * at the requested time, so a walk leg may be followed by idling at the stop.
 * Transfer waits are kept, since those are part of the trip.
 */
export function effectiveSeconds(it: MotisItinerary): number {
  const firstTransit = it.legs.findIndex(isTransit);
  if (firstTransit <= 0) return it.duration;
  const accessSeconds = it.legs.slice(0, firstTransit).reduce((sum, l) => sum + l.duration, 0);
  const leaveHome = Date.parse(it.legs[firstTransit].startTime) - accessSeconds * 1000;
  return (Date.parse(it.endTime) - leaveHome) / 1000;
}

export function summarize(it: MotisItinerary): string {
  const lines = it.legs
    .filter(isTransit)
    .map((l) => l.displayName || l.routeShortName || l.mode.toLowerCase())
    // A vehicle continuing as the same line shows up as two legs.
    .filter((name, i, all) => name !== all[i - 1]);
  if (!lines.length) return WALK_ONLY;
  const transfers = it.transfers ? ` · ${it.transfers} transfer${it.transfers > 1 ? "s" : ""}` : "";
  return `${lines.join(" → ")}${transfers}`;
}

export function toTrip(it: MotisItinerary): Trip {
  return {
    seconds: effectiveSeconds(it),
    summary: summarize(it),
    path: it.legs
      .filter((l) => l.legGeometry)
      .map((l) => ({
        points: decodePolyline(l.legGeometry!.points, l.legGeometry!.precision),
        color: isTransit(l) && l.routeColor ? `#${l.routeColor}` : undefined,
        dashed: !isTransit(l),
      })),
  };
}

/** Transit is the slowest service; keep a couple of requests in flight app-wide. */
const limiter = new Limiter(2);

export function transitTrip(origin: LatLon, dest: LatLon, departAt: Date): Promise<TripResult> {
  return limiter.run(() => planTrip(origin, dest, departAt));
}

async function planTrip(origin: LatLon, dest: LatLon, departAt: Date): Promise<TripResult> {
  const params = new URLSearchParams({
    fromPlace: `${origin.lat},${origin.lon}`,
    toPlace: `${dest.lat},${dest.lon}`,
    time: departAt.toISOString(),
    numItineraries: "3",
    // Default is 15 min of walking at each end, which fails for points like the
    // middle of a big park or an airfield; allow 30.
    maxPreTransitTime: "1800",
    maxPostTransitTime: "1800",
  });
  try {
    const r = await fetchJson<{ itineraries?: MotisItinerary[]; direct?: MotisItinerary[] }>(`${TRANSITOUS}?${params}`, {
      timeoutMs: 30_000,
      // The departure time is part of the URL; schedules can still change, so keep it short.
      persistMs: 12 * HOUR,
      accept: (d) => Array.isArray(d.itineraries),
    });
    // For short hops MOTIS returns only a direct walk; that is still the honest "transit" answer.
    const trips = [...(r.itineraries ?? []), ...(r.direct ?? [])].map(toTrip).sort((a, b) => a.seconds - b.seconds);
    return trips.length
      ? { status: "ok", trip: trips[0] }
      : { status: "none", reason: "No transit route found (area may not be covered)" };
  } catch (e) {
    return { status: "error", reason: `Transit lookup failed: ${e instanceof Error ? e.message : e}` };
  }
}
