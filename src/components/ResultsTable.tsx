import { Fragment } from "react";
import type { Alternative, Destination, Mode, TripResult } from "../types";
import { MODES } from "../types";
import { formatDistance, formatDuration, haversine } from "../lib/geo";
import { PAGE_SIZE } from "../api/places";
import type { LatLon } from "../types";
import { WALK_ONLY } from "../api/transit";

export interface Selection {
  key: string;
  mode: Mode;
}

const MODE_LABEL: Record<Mode, string> = { walk: "🚶 Walk", car: "🚗 Car", transit: "🚆 Transit" };

/** Colour bands for "at a glance" reading. */
export function band(seconds: number): "near" | "mid" | "far" {
  const min = seconds / 60;
  return min <= 10 ? "near" : min <= 20 ? "mid" : "far";
}

function Cell({ result, selected, onClick }: { result?: TripResult; selected: boolean; onClick: () => void }) {
  if (!result) return <td className="cell loading" aria-label="Loading">…</td>;
  if (result.status !== "ok") {
    return (
      <td className="cell none" title={result.reason}>
        —
      </td>
    );
  }
  const { trip } = result;
  return (
    <td className={`cell ${band(trip.seconds)}${selected ? " selected" : ""}`} title={trip.summary}>
      <button type="button" onClick={onClick}>
        {formatDuration(trip.seconds)}
        {trip.summary === WALK_ONLY && <span className="walk-only"> 🚶</span>}
      </button>
    </td>
  );
}

interface Props {
  origin: LatLon;
  rows: Destination[];
  selection: Selection | null;
  expandedKey: string | null;
  onSelect: (s: Selection) => void;
  onToggle: (key: string) => void;
  onChoose: (key: string, alt: Alternative | null) => void;
  onLoadMore: (key: string) => void;
  loadingMoreKey: string | null;
}

interface AlternativesProps {
  row: Destination;
  loading: boolean;
  onChoose: Props["onChoose"];
  onLoadMore: Props["onLoadMore"];
}

function Alternatives({ row, loading, onChoose, onLoadMore }: AlternativesProps) {
  const alts = row.alternatives ?? [];
  return (
    <div className="alternatives">
      <ul>
        {alts.map((a, i) => {
          const current = row.place?.lat === a.lat && row.place?.lon === a.lon;
          return (
            <li key={`${a.lat},${a.lon}`}>
              <button type="button" className={current ? "current" : undefined} onClick={() => onChoose(row.key, a)}>
                <span className="alt-name">
                  {/* Same number as the option's marker on the map. */}
                  <span className="rank">{current ? "●" : i + 1}</span>
                  {a.name}
                </span>
                <span className="alt-meta">
                  {formatDistance(a.distanceM)}
                  {a.walk?.status === "ok" && <> · 🚶 {formatDuration(a.walk.trip.seconds)}</>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {alts.length <= 1 && <p className="hint">No other options found nearby.</p>}
      <div className="alt-actions">
        {row.moreAvailable && (
          <button type="button" className="link" disabled={loading} onClick={() => onLoadMore(row.key)}>
            {loading ? "Loading…" : `Show ${PAGE_SIZE} more`}
          </button>
        )}
        {row.moreAvailable === false && alts.length > PAGE_SIZE && <span className="hint">That's everything nearby.</span>}
        {row.chosen && (
          <button type="button" className="link" onClick={() => onChoose(row.key, null)}>
            Reset to quickest walk
          </button>
        )}
      </div>
    </div>
  );
}

export function ResultsTable({
  origin,
  rows,
  selection,
  expandedKey,
  onSelect,
  onToggle,
  onChoose,
  onLoadMore,
  loadingMoreKey,
}: Props) {
  return (
    <>
      <table className="results">
        <thead>
          <tr>
            <th scope="col">Nearest</th>
            {MODES.map((m) => (
              <th scope="col" key={m}>
                {MODE_LABEL[m]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.key}>
            <tr className={selection?.key === r.key ? "selected" : undefined}>
              <th scope="row">
                <button
                  type="button"
                  className="row-label"
                  disabled={!r.place}
                  aria-expanded={r.alternatives ? expandedKey === r.key : undefined}
                  onClick={() => {
                    onSelect({ key: r.key, mode: selection?.mode ?? "walk" });
                    if (r.alternatives) onToggle(r.key);
                  }}
                >
                  <span className="icon">{r.icon}</span>
                  <span>
                    <span className="label">
                      {r.label}
                      {/* Only searched categories get a badge; pins and fixed places have no alternatives. */}
                      {r.place && r.alternatives && (
                        <span className={`badge ${r.chosen ? "selected" : "nearest"}`}>{r.chosen ? "selected" : "nearest"}</span>
                      )}
                      {r.alternatives && r.alternatives.length > 1 && (
                        <span className="caret">{expandedKey === r.key ? "▾" : "▸"}</span>
                      )}
                    </span>
                    <span className="place">
                      {r.place
                        ? `${r.place.name} · ${formatDistance(haversine(origin, r.place))}`
                        : (r.error ?? "Searching…")}
                    </span>
                  </span>
                </button>
              </th>
              {MODES.map((m) =>
                r.error ? (
                  <td key={m} className="cell none">
                    —
                  </td>
                ) : (
                  <Cell
                    key={m}
                    result={r.trips[m]}
                    selected={selection?.key === r.key && selection.mode === m}
                    onClick={() => onSelect({ key: r.key, mode: m })}
                  />
                ),
              )}
            </tr>
            {expandedKey === r.key && r.alternatives && (
              <tr className="alt-row">
                <td colSpan={MODES.length + 1}>
                  <Alternatives
                    row={r}
                    loading={loadingMoreKey === r.key}
                    onChoose={onChoose}
                    onLoadMore={onLoadMore}
                  />
                </td>
              </tr>
            )}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="legend">
        <span className="cell near">≤ 10 min</span>
        <span className="cell mid">≤ 20 min</span>
        <span className="cell far">&gt; 20 min</span>
        <span>🚶 = walking beats transit</span>
      </p>
    </>
  );
}
