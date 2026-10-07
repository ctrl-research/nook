import type { Category, Pin, Place, SchoolLevel } from "../types";
import type { Choices } from "./nearby";
import { DEFAULT_CATEGORY_IDS, presetById } from "../config/categories";

/**
 * All app state lives in the URL hash, so there is no storage or backend:
 * a bookmark restores a setup and a link shares it.
 *
 *   o=lat,lon  on=origin name  c=ids in order  cx=custom categories (JSON)
 *   p=pins (JSON)  ch=per-category picks (JSON)  sl=school level (e|s, omitted = both)
 *   t=departure (local "YYYY-MM-DDTHH:mm", omitted = next weekday 8am)
 */
export interface AppState {
  origin: Place | null;
  categories: Category[];
  pins: Pin[];
  /** Category id → place picked instead of the default nearest. */
  choices: Choices;
  depart: string | null;
  /** Only show this school level (both when null). */
  schoolLevel: SchoolLevel | null;
}

type CustomTuple = [id: string, label: string, icon: string, tags: string[]];
type PinTuple = [label: string, lat: number, lon: number, name: string];
type ChoiceTuple = [lat: number, lon: number, name: string];

const round = (n: number) => Math.round(n * 1e5) / 1e5;

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function decodeState(hash: string): AppState {
  const q = new URLSearchParams(hash.replace(/^#/, ""));

  let origin: Place | null = null;
  const [lat, lon] = (q.get("o") ?? "").split(",").map(Number);
  if (Number.isFinite(lat) && Number.isFinite(lon) && q.get("o")) {
    origin = { lat, lon, name: q.get("on") || `${lat}, ${lon}` };
  }

  const customs = new Map<string, Category>();
  for (const t of parseJson<CustomTuple[]>(q.get("cx"), [])) {
    if (Array.isArray(t) && typeof t[0] === "string" && Array.isArray(t[3])) {
      customs.set(t[0], { id: t[0], label: String(t[1]), icon: String(t[2] || "📍"), tags: t[3].map(String) });
    }
  }
  const ids = q.has("c") ? q.get("c")!.split(",").filter(Boolean) : DEFAULT_CATEGORY_IDS;
  const categories = ids.map((id) => customs.get(id) ?? presetById(id)).filter((c): c is Category => !!c);

  const pins = parseJson<PinTuple[]>(q.get("p"), [])
    .filter((t) => Array.isArray(t) && Number.isFinite(t[1]) && Number.isFinite(t[2]))
    .map(([label, lat, lon, name], i) => ({ id: String(i), label: String(label), place: { lat, lon, name: String(name ?? label) } }));

  const choices: Choices = {};
  const rawChoices = parseJson<Record<string, ChoiceTuple>>(q.get("ch"), {});
  for (const c of categories) {
    const t = rawChoices?.[c.id];
    if (Array.isArray(t) && Number.isFinite(t[0]) && Number.isFinite(t[1])) {
      choices[c.id] = { lat: t[0], lon: t[1], name: String(t[2] ?? c.label) };
    }
  }

  const sl = q.get("sl");
  const schoolLevel: SchoolLevel | null = sl === "e" ? "elementary" : sl === "s" ? "secondary" : null;

  return { origin, categories, pins, choices, depart: q.get("t"), schoolLevel };
}

export function encodeState(s: AppState): string {
  const q = new URLSearchParams();
  if (s.origin) {
    q.set("o", `${round(s.origin.lat)},${round(s.origin.lon)}`);
    q.set("on", s.origin.name);
  }
  const ids = s.categories.map((c) => c.id);
  if (ids.join(",") !== DEFAULT_CATEGORY_IDS.join(",")) q.set("c", ids.join(","));
  const customs = s.categories.filter((c) => !presetById(c.id));
  if (customs.length) q.set("cx", JSON.stringify(customs.map((c): CustomTuple => [c.id, c.label, c.icon, c.tags])));
  if (s.pins.length) {
    q.set("p", JSON.stringify(s.pins.map((p): PinTuple => [p.label, round(p.place.lat), round(p.place.lon), p.place.name])));
  }
  const picks = Object.entries(s.choices).filter(([id]) => s.categories.some((c) => c.id === id));
  if (picks.length) {
    q.set("ch", JSON.stringify(Object.fromEntries(picks.map(([id, p]) => [id, [round(p.lat), round(p.lon), p.name]]))));
  }
  if (s.depart) q.set("t", s.depart);
  if (s.schoolLevel) q.set("sl", s.schoolLevel[0]);
  return q.toString();
}

/** Next Monday–Friday at 08:00 local time (today if it's a weekday before 8). */
export function defaultDeparture(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(8, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

/** Formats a Date for `<input type="datetime-local">`. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
