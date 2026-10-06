import { useState } from "react";
import type { Category, Pin } from "../types";
import { PRESET_CATEGORIES } from "../config/categories";
import { parseTagSpec } from "../lib/tags";
import { AddressSearch } from "./AddressSearch";

interface Props {
  categories: Category[];
  pins: Pin[];
  depart: string;
  onCategories: (c: Category[]) => void;
  onPins: (p: Pin[]) => void;
  onDepart: (d: string) => void;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "custom";

export function Settings({ categories, pins, depart, onCategories, onPins, onDepart }: Props) {
  const active = new Set(categories.map((c) => c.id));
  const available = PRESET_CATEGORIES.filter((c) => !active.has(c.id));

  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("📍");
  const [tags, setTags] = useState("");
  const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
  const invalid = tagList.filter((t) => !parseTagSpec(t));
  const canAdd = label.trim() && tagList.length > 0 && invalid.length === 0;

  const [pinLabel, setPinLabel] = useState("");

  const addCustom = () => {
    let id = `x-${slug(label)}`;
    while (active.has(id)) id += "-";
    onCategories([...categories, { id, label: label.trim(), icon: icon.trim() || "📍", tags: tagList }]);
    setLabel("");
    setTags("");
    setIcon("📍");
  };

  return (
    <div className="settings">
      <section>
        <h3>Categories</h3>
        <ul className="chips">
          {categories.map((c) => (
            <li key={c.id} className="chip" title={c.tags.join(", ")}>
              {c.icon} {c.label}
              <button
                type="button"
                aria-label={`Remove ${c.label}`}
                onClick={() => onCategories(categories.filter((x) => x.id !== c.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {available.length > 0 && (
          <select
            value=""
            aria-label="Add a preset category"
            onChange={(e) => {
              const c = PRESET_CATEGORIES.find((p) => p.id === e.target.value);
              if (c) onCategories([...categories, c]);
            }}
          >
            <option value="">+ Add preset…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        )}
        <details>
          <summary>Custom category</summary>
          <form
            className="custom-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (canAdd) addCustom();
            }}
          >
            <div className="row">
              <input className="icon-input" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Icon" />
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name, e.g. Climbing gym" />
            </div>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="OSM tags, e.g. sport=climbing, leisure=sports_centre"
            />
            {invalid.length > 0 && <p className="hint error">Not a valid tag: {invalid.join(", ")}</p>}
            <p className="hint">
              Comma-separated; any match counts. Use <code>key=value</code>, <code>key=a|b</code> or <code>key</code>. Browse
              tags on the{" "}
              <a href="https://wiki.openstreetmap.org/wiki/Map_features" target="_blank" rel="noreferrer">
                OSM wiki
              </a>
              .
            </p>
            <button type="submit" disabled={!canAdd}>
              Add category
            </button>
          </form>
        </details>
      </section>

      <section>
        <h3>My places</h3>
        <ul className="chips">
          {pins.map((p) => (
            <li key={p.id} className="chip" title={p.place.name}>
              📌 {p.label}
              <button type="button" aria-label={`Remove ${p.label}`} onClick={() => onPins(pins.filter((x) => x.id !== p.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <input value={pinLabel} onChange={(e) => setPinLabel(e.target.value)} placeholder="Label, e.g. Office" />
        </div>
        <AddressSearch
          placeholder="Search an address to pin…"
          clearOnSelect
          onSelect={(place) => {
            onPins([...pins, { id: `${Date.now()}`, label: pinLabel.trim() || place.name, place }]);
            setPinLabel("");
          }}
        />
      </section>

      <section>
        <h3>Transit departure</h3>
        <input type="datetime-local" value={depart} onChange={(e) => e.target.value && onDepart(e.target.value)} />
        <p className="hint">Defaults to the next weekday at 8:00 so results don't depend on when you look.</p>
      </section>
    </div>
  );
}
