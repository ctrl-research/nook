import { useEffect, useState } from "react";
import type { Alternative, Mode, Place, Trip } from "./types";
import { MODES } from "./types";
import { inRegion, REGION } from "./config/region";
import { AddressSearch } from "./components/AddressSearch";
import { MapView } from "./components/MapView";
import { ResultsTable, type Selection } from "./components/ResultsTable";
import { Settings } from "./components/Settings";
import { streetRoute } from "./api/routing";
import { clearResponseCache } from "./api/http";
import { autocompleteEnabled } from "./api/autocomplete";
import { moreAlternatives, tripsFor } from "./lib/nearby";
import { useDestinations } from "./lib/useDestinations";
import { decodeState, defaultDeparture, encodeState, toLocalInput, type AppState } from "./lib/urlState";

function useHashState(): [AppState, (fn: (s: AppState) => AppState) => void] {
  const [state, setState] = useState(() => decodeState(window.location.hash));
  useEffect(() => {
    const onHash = () => setState(decodeState(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const update = (fn: (s: AppState) => AppState) =>
    setState((prev) => {
      const next = fn(prev);
      // replaceState doesn't fire hashchange, so this won't loop.
      history.replaceState(null, "", `#${encodeState(next)}`);
      return next;
    });
  return [state, update];
}

export function App() {
  const [state, update] = useHashState();
  const { origin, categories, pins, choices } = state;
  const depart = state.depart ?? toLocalInput(defaultDeparture());

  const { rows, busy, patchRow } = useDestinations(origin, categories, pins, choices, depart);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [route, setRoute] = useState<Trip | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A new origin or departure redoes every row, so drop the selection with it.
  useEffect(() => {
    setSelection(null);
    setExpandedKey(null);
  }, [origin?.lat, origin?.lon, depart]);

  // Route geometry for the selected cell: transit trips carry it; street routes are fetched on demand.
  const selectedRow = rows.find((r) => r.key === selection?.key);
  const selectedResult = selection && selectedRow?.trips[selection.mode];
  useEffect(() => {
    setRoute(null);
    if (!origin || !selection || !selectedRow?.place || selectedResult?.status !== "ok") return;
    if (selection.mode === "transit") {
      setRoute(selectedResult.trip);
      return;
    }
    let cancelled = false;
    streetRoute(selection.mode, origin, selectedRow.place)
      .then((r) => !cancelled && setRoute(r))
      .catch((e) => console.warn("[nook] route failed", e));
    return () => {
      cancelled = true;
    };
  }, [selection?.key, selection?.mode, selectedResult?.status, selectedRow?.place]);

  /** Swap a category's place for one of its alternatives (`null` = back to the default). */
  const choose = (key: string, alt: Alternative | null) => {
    const row = rows.find((r) => r.key === key);
    const place = alt ?? row?.alternatives?.[0];
    if (!origin || !row || !place) return;
    const id = key.replace(/^cat:/, "");
    update((s) => {
      const next = { ...s.choices };
      if (alt) next[id] = { lat: alt.lat, lon: alt.lon, name: alt.name };
      else delete next[id];
      return { ...s, choices: next };
    });
    const walk = row.alternatives?.find((a) => a.lat === place.lat && a.lon === place.lon)?.walk;
    patchRow(key, (r) => ({ ...r, place, chosen: !!alt, trips: walk ? { walk } : {} }));
    const missing: Mode[] = MODES.filter((m) => m !== "walk" || !walk);
    tripsFor(origin, place, missing, new Date(depart), (mode, result) =>
      // Ignore late results if the row has moved on to another place meanwhile.
      patchRow(key, (r) => (r.place === place ? { ...r, trips: { ...r.trips, [mode]: result } } : r)),
    );
  };

  const [loadingMore, setLoadingMore] = useState<string | null>(null);
  /** Appends the next batch of options to a category's list. */
  const loadMore = (key: string) => {
    const row = rows.find((r) => r.key === key);
    const category = categories.find((c) => `cat:${c.id}` === key);
    if (!origin || !row?.alternatives || !category) return;
    setLoadingMore(key);
    moreAlternatives(origin, category, row.alternatives)
      .then((extra) =>
        patchRow(key, (r) =>
          r.alternatives ? { ...r, alternatives: [...r.alternatives, ...extra], moreAvailable: extra.length > 0 } : r,
        ),
      )
      .catch((e) => console.warn("[nook] show more failed", e))
      .finally(() => setLoadingMore(null));
  };

  // The origin is only ever set from the search box: a stray map click shouldn't move it.
  const setOrigin = (p: Place) => {
    if (!inRegion(p)) {
      setNotice(`Nook currently covers ${REGION.name} only.`);
      return;
    }
    setNotice(null);
    update((s) => ({ ...s, origin: p, choices: {} }));
  };

  const [shareNote, setShareNote] = useState<string | null>(null);

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>📍 Nook</h1>
          <p className="tagline">What's nearby, and how long it takes to get there.</p>
        </header>

        <AddressSearch
          placeholder="Enter an address in the GTA"
          initialValue={origin?.name}
          onSelect={setOrigin}
        />
        {notice && <p className="notice">{notice}</p>}

        {origin ? (
          <>
            <div className="status-row">
              <span>{busy ? "Looking things up…" : `From ${origin.name}`}</span>
              <button
                type="button"
                className="link"
                onClick={() =>
                  navigator.clipboard
                    .writeText(window.location.href)
                    .then(() => setShareNote("Link copied"))
                    .catch(() => setShareNote("Copy the URL to share"))
                    .finally(() => setTimeout(() => setShareNote(null), 2000))
                }
              >
                {shareNote ?? "Copy link"}
              </button>
            </div>
            <ResultsTable
              origin={origin}
              rows={rows}
              selection={selection}
              expandedKey={expandedKey}
              onSelect={setSelection}
              onToggle={(key) => setExpandedKey((k) => (k === key ? null : key))}
              onChoose={choose}
              onLoadMore={loadMore}
              loadingMoreKey={loadingMore}
            />
          </>
        ) : (
          <p className="empty">Search for an address in {REGION.name} to start.</p>
        )}

        <Settings
          categories={categories}
          pins={pins}
          depart={depart}
          onCategories={(c) => update((s) => ({ ...s, categories: c }))}
          onPins={(p) => update((s) => ({ ...s, pins: p }))}
          onDepart={(t) => update((s) => ({ ...s, depart: t }))}
        />

        <footer>
          Data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, map style by <a href="https://openfreemap.org">OpenFreeMap</a>. Routing by{" "}
          <a href="https://routing.openstreetmap.de/">FOSSGIS OSRM</a>, transit by <a href="https://transitous.org/">Transitous</a>,
          search by <a href="https://nominatim.org/">Nominatim</a>
          {autocompleteEnabled() && (
            <>
              , address suggestions powered by <a href="https://www.geoapify.com/">Geoapify</a>
            </>
          )}
          .
          <br />
          Results are cached in this browser for up to a week.{" "}
          <button
            type="button"
            className="link"
            onClick={() => clearResponseCache().then(() => window.location.reload())}
          >
            Clear cached data
          </button>
        </footer>
      </aside>

      <MapView
        origin={origin}
        rows={rows}
        selectedKey={selection?.key ?? null}
        expandedKey={expandedKey}
        route={route}
        onSelectRow={(key) => {
          setSelection({ key, mode: selection?.mode ?? "walk" });
          setExpandedKey(key);
        }}
        onChoose={choose}
        onClearSelection={() => {
          setSelection(null);
          setExpandedKey(null);
        }}
      />
    </div>
  );
}
