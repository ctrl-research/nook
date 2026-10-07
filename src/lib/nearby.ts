import type { Alternative, Category, Destination, LatLon, Mode, Pin, Place, TripResult } from "../types";
import { findPlaces, PAGE_SIZE } from "../api/places";
import { streetTable, type StreetMode } from "../api/routing";
import { transitTrip } from "../api/transit";

/** Category id → the place the user picked instead of the default. */
export type Choices = Record<string, Place>;

const samePlace = (a: LatLon, b: LatLon) => Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5;

/**
 * Orders options by walking time (a park across a highway shouldn't win just for
 * being close); options without a walk time go last, by straight-line distance.
 */
export function rankByWalk(options: Alternative[]): Alternative[] {
  const secs = (a: Alternative) => (a.walk?.status === "ok" ? a.walk.trip.seconds : Infinity);
  return [...options].sort((a, b) => secs(a) - secs(b) || a.distanceM - b.distanceM);
}

/**
 * The next `PAGE_SIZE` options for a category beyond those already shown, with
 * walk times, shortest walk first. Returns [] when nothing else is in range.
 */
export async function moreAlternatives(origin: LatLon, category: Category, existing: Alternative[]): Promise<Alternative[]> {
  const want = existing.length + PAGE_SIZE;
  const found = await findPlaces(origin, category, { min: want, max: want });
  if (!found.ok) return [];
  const fresh = found.candidates.filter((c) => !existing.some((e) => samePlace(e, c)));
  const walks = await streetTable("walk", origin, fresh);
  return rankByWalk(fresh.map((c, i) => ({ ...c, walk: walks[i] })));
}

/** Fetches the given modes for one destination, reporting each as it lands. */
export async function tripsFor(
  origin: LatLon,
  place: Place,
  modes: Mode[],
  departAt: Date,
  onResult: (mode: Mode, result: TripResult) => void,
): Promise<void> {
  await Promise.all(
    modes.map(async (mode) => {
      const result =
        mode === "transit" ? await transitTrip(origin, place, departAt) : (await streetTable(mode, origin, [place]))[0];
      onResult(mode, result);
    }),
  );
}

/** Applies an update to one row; ignored if that row is gone. */
export type PatchRow = (key: string, fn: (d: Destination) => Destination) => void;

export const pinKey = (p: Pin) => `pin:${p.id}`;
export const categoryKey = (c: Category) => `cat:${c.id}`;

/** The row shown before any lookup has finished. */
export function placeholderRow(item: { pin: Pin } | { category: Category }): Destination {
  if ("pin" in item) return { key: pinKey(item.pin), label: item.pin.label, icon: "📌", place: item.pin.place, trips: {} };
  const c = item.category;
  return { key: categoryKey(c), label: c.label, icon: c.icon, place: c.fixed ?? null, trips: {} };
}

/**
 * Resolves the given categories and pins (a batch: everything on first load, or
 * just what was added since) and fills in walk, car and transit times through
 * `patch`. Every category resolves independently, so each row appears as soon as
 * its own lookups finish. A category becomes the user's choice, or the shortest
 * walk among the options found in the smallest search box with any match.
 * Stops early (without throwing) on abort.
 */
export async function resolveDestinations(
  origin: LatLon,
  categories: Category[],
  pins: Pin[],
  choices: Choices,
  departAt: Date,
  patch: PatchRow,
  signal: AbortSignal,
): Promise<void> {
  const setTrip = (key: string, mode: Mode, result: TripResult) =>
    patch(key, (d) => ({ ...d, trips: { ...d.trips, [mode]: result } }));

  /** Fills in the given modes for the given destinations, one request per street mode. */
  const route = async (targets: { key: string; place: Place }[], modes: Mode[]) => {
    if (!targets.length) return;
    const street = modes.filter((m): m is StreetMode => m !== "transit");
    await Promise.all([
      ...street.map(async (mode) => {
        const results = await streetTable(mode, origin, targets.map((t) => t.place));
        if (signal.aborted) return;
        targets.forEach((t, i) => setTrip(t.key, mode, results[i]));
      }),
      ...(modes.includes("transit")
        ? targets.map(async (t) => {
            const result = await transitTrip(origin, t.place, departAt);
            if (!signal.aborted) setTrip(t.key, "transit", result);
          })
        : []),
    ]);
  };

  const resolveCategory = async (c: Category) => {
    const key = categoryKey(c);
    const choice = choices[c.id];
    const found = await findPlaces(origin, c, { signal });
    if (signal.aborted) return;
    if (!found.ok && !choice) {
      patch(key, (d) => ({ ...d, error: found.reason }));
      return;
    }
    const candidates = found.ok ? found.candidates : [];
    const walks = await streetTable("walk", origin, candidates);
    if (signal.aborted) return;
    const alternatives = rankByWalk(candidates.map((cand, i) => ({ ...cand, walk: walks[i] })));
    const match = choice ? alternatives.find((a) => samePlace(a, choice)) : alternatives[0];
    const picked: Place = match ?? choice;
    const walk = match?.walk;
    // Whether more exist is only known after asking; "show more" turns this off if not.
    patch(key, (d) => ({ ...d, place: picked, alternatives, moreAvailable: true, chosen: !!choice, trips: walk ? { walk } : {} }));
    await route([{ key, place: picked }], walk ? ["car", "transit"] : ["walk", "car", "transit"]);
  };

  const direct = [
    ...pins.map((p) => ({ key: pinKey(p), place: p.place })),
    ...categories.flatMap((c) => (c.fixed ? [{ key: categoryKey(c), place: c.fixed }] : [])),
  ];
  await Promise.all([
    route(direct, ["walk", "car", "transit"]),
    ...categories.filter((c) => !c.fixed).map(resolveCategory),
  ]);
}
