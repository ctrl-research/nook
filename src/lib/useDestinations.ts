import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Category, Destination, Pin, Place } from "../types";
import { categoryKey, pinKey, placeholderRow, resolveDestinations, type Choices, type PatchRow } from "./nearby";

/** What a row was computed from; if this changes, the row is recomputed. */
const signature = (item: { pin: Pin } | { category: Category }) =>
  "pin" in item
    ? JSON.stringify([item.pin.label, item.pin.place.lat, item.pin.place.lon])
    : JSON.stringify([item.category.label, item.category.icon, item.category.tags, item.category.fixed]);

/**
 * Compares what is being tracked (key → signature) with what is wanted now:
 * `dropped` rows were removed or changed, `fresh` rows need a lookup.
 * A changed row appears in both, so it is redone.
 */
export function diffRows<T extends { sig: string }>(
  current: ReadonlyMap<string, string>,
  wanted: ReadonlyMap<string, T>,
): { dropped: string[]; fresh: [string, T][] } {
  const dropped = [...current].filter(([key, sig]) => wanted.get(key)?.sig !== sig).map(([key]) => key);
  const fresh = [...wanted].filter(([key, w]) => current.get(key) !== w.sig);
  return { dropped, fresh };
}

interface Task {
  sig: string;
  batch: AbortController;
}

/**
 * Keeps one result row per pin and category, and only does work for what
 * changed: adding a pin or category looks up just that one, removing one drops
 * its row. Everything is recomputed only when the origin or departure changes.
 */
export function useDestinations(
  origin: Place | null,
  categories: Category[],
  pins: Pin[],
  choices: Choices,
  depart: string,
): { rows: Destination[]; busy: boolean; patchRow: PatchRow } {
  const [byKey, setByKey] = useState<Record<string, Destination>>({});
  const [inFlight, setInFlight] = useState(0);
  const tasks = useRef(new Map<string, Task>());
  const batches = useRef(new Set<AbortController>());
  const base = useRef<string | null>(null);
  // Picks are read when a row is first resolved; later changes are applied in
  // place by the caller (via patchRow) rather than by re-resolving.
  const choicesRef = useRef(choices);
  choicesRef.current = choices;

  const patchRow: PatchRow = useCallback(
    (key, fn) => setByKey((rows) => (rows[key] ? { ...rows, [key]: fn(rows[key]) } : rows)),
    [],
  );

  const baseKey = origin ? `${origin.lat},${origin.lon}|${depart}` : null;

  useEffect(() => {
    if (base.current !== baseKey) {
      // New origin or departure: everything is stale.
      base.current = baseKey;
      batches.current.forEach((b) => b.abort());
      batches.current.clear();
      tasks.current.clear();
      setByKey({});
    }
    if (!origin) return;

    const wanted = new Map<string, { sig: string; item: { pin: Pin } | { category: Category } }>();
    for (const pin of pins) wanted.set(pinKey(pin), { sig: signature({ pin }), item: { pin } });
    for (const category of categories) wanted.set(categoryKey(category), { sig: signature({ category }), item: { category } });

    const current = new Map([...tasks.current].map(([key, t]) => [key, t.sig]));
    const { dropped, fresh } = diffRows(current, wanted);
    for (const key of dropped) tasks.current.delete(key);
    setByKey((rows) => {
      const next = { ...rows };
      for (const key of dropped) delete next[key];
      for (const [key, { item }] of fresh) next[key] = placeholderRow(item);
      return next;
    });
    if (!fresh.length) return;

    // Look up only the new items, as one batch (one place query for all new categories).
    const batch = new AbortController();
    batches.current.add(batch);
    for (const [key, { sig }] of fresh) tasks.current.set(key, { sig, batch });
    // A row removed mid-lookup no longer belongs to this batch; ignore its late results.
    const patch: PatchRow = (key, fn) => tasks.current.get(key)?.batch === batch && patchRow(key, fn);
    const items = fresh.map(([, { item }]) => item);
    setInFlight((n) => n + 1);
    resolveDestinations(
      origin,
      items.flatMap((i) => ("category" in i ? [i.category] : [])),
      items.flatMap((i) => ("pin" in i ? [i.pin] : [])),
      choicesRef.current,
      new Date(depart),
      patch,
      batch.signal,
    )
      .catch((e) => console.error("[nook] lookup failed", e))
      .finally(() => {
        batches.current.delete(batch);
        setInFlight((n) => n - 1);
      });
  }, [baseKey, categories, pins]);

  const rows = useMemo(
    () =>
      [...pins.map((p) => byKey[pinKey(p)]), ...categories.map((c) => byKey[categoryKey(c)])].filter(
        (r): r is Destination => !!r,
      ),
    [byKey, pins, categories],
  );
  return { rows, busy: inFlight > 0, patchRow };
}
