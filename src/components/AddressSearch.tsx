import { useEffect, useId, useRef, useState } from "react";
import type { LatLon, Place } from "../types";
import { searchAddress, searchAddressOnce } from "../api/geocode";

interface Props {
  placeholder: string;
  near?: LatLon;
  onSelect: (place: Place) => void;
  /** Clear the input after a selection (for "add" flows). */
  clearOnSelect?: boolean;
  initialValue?: string;
}

export function AddressSearch({ placeholder, near, onSelect, clearOnSelect, initialValue = "" }: Props) {
  const [text, setText] = useState(initialValue);
  const [results, setResults] = useState<Place[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dirty = useRef(false);
  const listId = useId();

  useEffect(() => {
    if (!dirty.current) setText(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const q = text.trim();
    if (!dirty.current || q.length < 3) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      searchAddress(q, near, ctrl.signal)
        .then((r) => !ctrl.signal.aborted && show(r))
        .catch((e) => !ctrl.signal.aborted && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
      setLoading(false);
    };
    // `near` only biases ranking; don't re-query when it changes.
  }, [text]);

  const show = (r: Place[]) => {
    setResults(r);
    setActive(0);
    setOpen(true);
    setError(r.length ? null : "No matches");
  };

  /** Enter with no suggestions: a single explicit lookup via Nominatim. */
  const submit = () => {
    const q = text.trim();
    if (q.length < 3) return;
    setLoading(true);
    searchAddressOnce(q)
      .then(show)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  const choose = (p: Place) => {
    dirty.current = false;
    setText(clearOnSelect ? "" : p.name);
    setOpen(false);
    setResults([]);
    onSelect(p);
  };

  return (
    <div className="search">
      <input
        type="search"
        value={text}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        onChange={(e) => {
          dirty.current = true;
          setText(e.target.value);
        }}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (!open || !results.length)) {
            e.preventDefault();
            submit();
            return;
          }
          if (!open || !results.length) return;
          if (e.key === "ArrowDown") setActive((a) => (a + 1) % results.length);
          else if (e.key === "ArrowUp") setActive((a) => (a - 1 + results.length) % results.length);
          else if (e.key === "Enter") choose(results[active]);
          else if (e.key === "Escape") setOpen(false);
          else return;
          e.preventDefault();
        }}
      />
      {loading ? (
        <div className="search-status">Searching…</div>
      ) : (
        error && <div className="search-error">{error === "No matches" ? error : `Search unavailable: ${error}`} · press Enter to retry</div>
      )}
      {open && results.length > 0 && (
        <ul className="search-results" id={listId} role="listbox">
          {results.map((r, i) => (
            <li
              key={`${r.lat},${r.lon},${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
            >
              <span className="name">{r.name}</span>
              {r.detail && <span className="detail">{r.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
