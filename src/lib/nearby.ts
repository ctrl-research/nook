import type { Alternative, Category, Destination, LatLon, Mode, Pin, Place, TripResult } from "../types";
import { findCandidates, PAGE_SIZE } from "../api/places";
import { streetTable, type StreetMode } from "../api/routing";
import { transitTrip } from "../api/transit";
import { mapLimit } from "../api/http";

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
  const found = (await findCandidates(origin, [category], existing.length + PAGE_SIZE)).get(category.id);
  if (!found?.ok) return [];
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
 * `patch`. Each category becomes the user's choice, or the shortest walk among
 * the nearest few. Pins and fixed places are routed straight away, in parallel
 * with the slower category search. Stops early (without throwing) on abort.
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
      // Transit is the slowest service; keep a couple of requests in flight at most.
      modes.includes("transit") &&
        mapLimit(targets, 2, async (t) => {
          if (signal.aborted) return;
          const result = await transitTrip(origin, t.place, departAt);
          if (!signal.aborted) setTrip(t.key, "transit", result);
        }),
    ]);
  };

  const resolveCategories = async (searched: Category[]) => {
    if (!searched.length) return;
    const found = await findCandidates(origin, searched, undefined, signal);
    if (signal.aborted) return;

    // One walking table across every option, used both to rank and to display.
    const pool = searched.flatMap((c) => {
      const r = found.get(c.id);
      return r?.ok ? r.candidates.map((candidate) => ({ id: c.id, candidate })) : [];
    });
    const walks = await streetTable("walk", origin, pool.map((p) => p.candidate));
    if (signal.aborted) return;

    const resolved: { key: string; place: Place }[] = [];
    const needWalk: { key: string; place: Place }[] = [];
    for (const c of searched) {
      const key = categoryKey(c);
      const r = found.get(c.id);
      const choice = choices[c.id];
      const alternatives = rankByWalk(pool.flatMap((p, i) => (p.id === c.id ? [{ ...p.candidate, walk: walks[i] }] : [])));
      if (!r?.ok && !choice) {
        patch(key, (d) => ({ ...d, error: r?.reason ?? "Not searched" }));
        continue;
      }
      const match = choice ? alternatives.find((a) => samePlace(a, choice)) : alternatives[0];
      const picked: Place = match ?? choice;
      const walk = match?.walk;
      resolved.push({ key, place: picked });
      if (!walk) needWalk.push({ key, place: picked });
      const moreAvailable = alternatives.length >= PAGE_SIZE;
      patch(key, (d) => ({ ...d, place: picked, alternatives, moreAvailable, chosen: !!choice, trips: walk ? { walk } : {} }));
    }
    await Promise.all([route(resolved, ["car", "transit"]), route(needWalk, ["walk"])]);
  };

  const direct = [
    ...pins.map((p) => ({ key: pinKey(p), place: p.place })),
    ...categories.flatMap((c) => (c.fixed ? [{ key: categoryKey(c), place: c.fixed }] : [])),
  ];
  await Promise.all([route(direct, ["walk", "car", "transit"]), resolveCategories(categories.filter((c) => !c.fixed))]);
}
