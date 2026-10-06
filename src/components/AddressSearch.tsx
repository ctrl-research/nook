import { useEffect, useId, useState } from "react";
import type { Place } from "../types";
import { searchAddress } from "../api/geocode";
import { autocompleteEnabled, suggestAddresses } from "../api/autocomplete";

interface Props {
  placeholder: string;
  onSelect: (place: Place) => void;
  /** Clear the input after a selection (for "add" flows). */
  clearOnSelect?: boolean;
  initialValue?: string;
}

/**
 * Suggestions while typing come from Geoapify when a key is configured; the
 * Search button (or Enter with no suggestion list open) runs a Nominatim
 * search. Without Geoapify the box is simply submit-to-search.
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

  // Suggestions while typing (no-op when autocomplete is off).
  useEffect(() => {
    const q = text.trim();
    if (!editing || q.length < 3 || !autocompleteEnabled()) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      suggestAddresses(q, ctrl.signal)
        .then((r) => {
          if (ctrl.signal.aborted) return;
          setResults(r.length ? r : null);
          setActive(0);
        })
        .catch(() => {
          // A failed suggestion isn't worth an error; Search still works.
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [text, editing]);

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
  const hint = autocompleteEnabled() ? "Pick a suggestion, or press Search" : "Press Enter to search";

  return (
    <div className="search">
      <form
        className="search-row"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          // The button always searches; Enter picks the highlighted suggestion if there is one.
          const viaButton = (e.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement;
          if (!viaButton && open && results) choose(results[active]);
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
            setError(null);
            // Keep suggestions on screen until fresher ones arrive; search results belong to the old text.
            if (!autocompleteEnabled() || e.target.value.trim().length < 3) setResults(null);
          }}
          onBlur={() => setTimeout(() => setResults(null), 150)}
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
        editing && !open && !loading && text.trim().length >= 3 && <div className="search-status">{hint}</div>
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
