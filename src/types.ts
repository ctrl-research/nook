export interface LatLon {
  lat: number;
  lon: number;
}

export interface Place extends LatLon {
  name: string;
  /** Secondary line, e.g. street address or OSM type. */
  detail?: string;
  /** Set for schools from the Ontario open dataset. */
  school?: SchoolInfo;
}

/** EQAO results: % of students meeting the provincial standard (null = not reported). */
export interface SchoolScores {
  g3r: number | null;
  g3w: number | null;
  g3m: number | null;
  g6r: number | null;
  g6w: number | null;
  g6m: number | null;
  g9m: number | null;
  /** Grade 10 literacy test (OSSLT), first-attempt pass rate. */
  osslt: number | null;
}

export type SchoolLevel = "elementary" | "secondary";

export interface SchoolInfo {
  id: string;
  level: SchoolLevel;
  /** Public, Catholic, … */
  type: string;
  language: string;
  grades: string;
  board: string;
  website?: string;
  enrolment: number | null;
  scores: SchoolScores;
}

/**
 * A generic, searchable kind of place. Each entry in `tags` is an OSM tag
 * filter (`key=value`, `key=v1|v2`, or bare `key`); entries are OR'd.
 */
export interface Category {
  id: string;
  label: string;
  icon: string;
  tags: string[];
  /** A single well-known spot instead of a search (e.g. downtown). */
  fixed?: Place;
  /** Search a bundled dataset instead of OSM tags. */
  dataset?: "schools";
  /** For the schools dataset: only this level (both when unset). */
  schoolLevel?: SchoolLevel;
}

/** A specific, user-chosen destination ("Office", "Mom's place"). */
export interface Pin {
  id: string;
  label: string;
  place: Place;
}

export type Mode = "car" | "walk" | "transit";
export const MODES: Mode[] = ["walk", "car", "transit"];

export interface Trip {
  seconds: number;
  meters?: number;
  /** Short human summary, e.g. "Line 1 · 1 transfer". */
  summary?: string;
  /** Route polylines as [lat, lon] pairs, with an optional colour per segment. */
  path?: { points: [number, number][]; color?: string; dashed?: boolean }[];
}

export type TripResult =
  | { status: "ok"; trip: Trip }
  | { status: "none"; reason: string }
  | { status: "error"; reason: string };

/** A nearby option for a category, with its walking time from the origin. */
export interface Alternative extends Place {
  distanceM: number;
  walk?: TripResult;
}

/** One row in the results table: a category's chosen place (nearest by default) or a pin. */
export interface Destination {
  key: string;
  label: string;
  icon: string;
  place: Place | null;
  /** Why no place was found, when `place` is null. */
  error?: string;
  trips: Partial<Record<Mode, TripResult>>;
  /** Other nearby options for a category, shortest walk first. */
  alternatives?: Alternative[];
  /** True when the user picked `place` instead of the default. */
  chosen?: boolean;
  /** False once a "show more" request came back with nothing new. */
  moreAvailable?: boolean;
  /** Set when the row's options come from a bundled dataset (e.g. schools). */
  dataset?: Category["dataset"];
}
