import { useEffect, useId, useState } from "react";
import type { Place } from "../types";
import { searchAddress } from "../api/geocode";

interface Props {
  placeholder: string;
  onSelect: (place: Place) => void;
  /** Clear the input after a selection (for "add" flows). */
  clearOnSelect?: boolean;
  initialValue?: string;
}

/**
 * Search on submit (Enter or the Search button), not as you type: the free
 * geocoder's policy forbids type-ahead, and submitted searches take ~0.5s.
 */
export function AddressSearch({ placeholder, onSelect, clearOnSelect, initialValue = "" }: Props) {
  const [text, setText] = useState(initialValue);
  const [results, setResults] = useState<Place[] | null>(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const listId = useId();

  useEffect(() => {
    if (!editing) setText(initialValue);
  }, [initialValue, editing]);

  const submit = () => {
    const q = text.trim();
    if (q.length < 3) {
      setError("Type at least 3 characters");
      return;
    }
    setLoading(true);
    setError(null);
    searchAddress(q)
      .then((r) => {
        setResults(r);
        setActive(0);
        if (!r.length) setError("No matches in the GTA. Try adding the city, e.g. “… Mississauga”");
      })
      .catch((e) => setError(`Search unavailable: ${e instanceof Error ? e.message : e}`))
      .finally(() => setLoading(false));
  };

  const choose = (p: Place) => {
    setEditing(false);
    setText(clearOnSelect ? "" : p.name);
    setResults(null);
    setError(null);
    onSelect(p);
  };

  const open = !!results?.length;

  return (
    <div className="search">
      <form
        className="search-row"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (open && results) choose(results[active]);
          else submit();
        }}
      >
        <input
          type="search"
          value={text}
          placeholder={placeholder}
          aria-expanded={open}
          aria-controls={listId}
          onChange={(e) => {
            setEditing(true);
            setText(e.target.value);
            setResults(null); // results belong to the previous query
            setError(null);
          }}
          onKeyDown={(e) => {
            if (!open || !results) return;
            if (e.key === "ArrowDown") setActive((a) => (a + 1) % results.length);
            else if (e.key === "ArrowUp") setActive((a) => (a - 1 + results.length) % results.length);
            else if (e.key === "Escape") setResults(null);
            else return;
            e.preventDefault();
          }}
        />
        <button type="submit" className="search-button" disabled={loading}>
          {loading ? "…" : "Search"}
        </button>
      </form>
      {error ? (
        <div className="search-error">{error}</div>
      ) : (
        editing && !open && !loading && text.trim().length >= 3 && <div className="search-status">Press Enter to search</div>
      )}
      {open && (
        <ul className="search-results" id={listId} role="listbox">
          {results!.map((r, i) => (
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
