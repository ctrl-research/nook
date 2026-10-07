import type { LatLon, SchoolInfo, SchoolLevel, SchoolScores } from "../types";
import { haversine } from "../lib/geo";
import { fetchJson } from "./http";
import { DAY } from "./persistentCache";
import type { Candidate, CandidateResult } from "./places";

/**
 * Publicly funded GTA schools with EQAO results, bundled with the site
 * (public/data/schools-gta.json, built by scripts/update-schools.mjs from
 * Ontario's open "School information and student demographics" dataset).
 * Contains information licensed under the Open Government Licence – Ontario.
 */
export const SCHOOLS_SOURCE = {
  dataset: "https://data.ontario.ca/dataset/school-information-and-student-demographics",
  licence: "https://www.ontario.ca/page/open-government-licence-ontario",
};

const MAX_DISTANCE_M = 30_000;

interface SchoolsFile {
  extracted: string;
  ontarioAverage: SchoolScores;
  fields: string[];
  schools: (string | number | null)[][];
}

export interface School extends LatLon {
  name: string;
  street: string;
  city: string;
  info: SchoolInfo;
}

export interface SchoolData {
  extracted: string;
  ontarioAverage: SchoolScores;
  schools: School[];
}

const SCORE_KEYS: (keyof SchoolScores)[] = ["g3r", "g3w", "g3m", "g6r", "g6w", "g6m", "g9m", "osslt"];

export function parseSchools(file: SchoolsFile): SchoolData {
  const at = Object.fromEntries(file.fields.map((f, i) => [f, i]));
  const schools = file.schools.map((row): School => {
    const v = (f: string) => row[at[f]];
    const str = (f: string) => String(v(f) ?? "");
    return {
      lat: Number(v("lat")),
      lon: Number(v("lon")),
      name: str("name"),
      street: str("street"),
      city: str("city"),
      info: {
        id: str("id"),
        level: v("level") === "S" ? "secondary" : "elementary",
        type: str("type"),
        language: str("language"),
        grades: str("grades"),
        board: str("board"),
        website: normalizeUrl(str("website")),
        enrolment: (v("enrolment") as number | null) ?? null,
        scores: Object.fromEntries(SCORE_KEYS.map((k) => [k, (v(k) as number | null) ?? null])) as unknown as SchoolScores,
      },
    };
  });
  return { extracted: file.extracted, ontarioAverage: file.ontarioAverage, schools };
}

/** Board sites are often listed without a scheme. */
function normalizeUrl(s: string): string | undefined {
  if (!s || s === "NA") return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

let loading: Promise<SchoolData> | null = null;

/** Loads (once) the bundled school data. Relative URL, so it works under any base path. */
export function loadSchools(): Promise<SchoolData> {
  loading ??= fetchJson<SchoolsFile>(`${import.meta.env.BASE_URL}data/schools-gta.json`, { persistMs: 7 * DAY })
    .then(parseSchools)
    .catch((e) => {
      loading = null; // let a later call retry
      throw e;
    });
  return loading;
}

export function toCandidate(s: School, origin: LatLon): Candidate {
  return {
    lat: s.lat,
    lon: s.lon,
    name: s.name,
    detail: [s.street, s.city].filter(Boolean).join(", "),
    school: s.info,
    distanceM: haversine(origin, s),
  };
}

/** The `max` nearest schools (optionally of one level) within 30 km. */
export function nearestSchools(
  data: SchoolData,
  origin: LatLon,
  { level, max }: { level?: SchoolLevel; max: number },
): Candidate[] {
  return data.schools
    .filter((s) => !level || s.info.level === level)
    .map((s) => toCandidate(s, origin))
    .filter((c) => c.distanceM <= MAX_DISTANCE_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, max);
}

export async function findSchools(
  origin: LatLon,
  level: SchoolLevel | undefined,
  max: number,
): Promise<CandidateResult> {
  try {
    const candidates = nearestSchools(await loadSchools(), origin, { level, max });
    return candidates.length ? { ok: true, candidates } : { ok: false, reason: "No schools within 30 km" };
  } catch (e) {
    return { ok: false, reason: `School data unavailable: ${e instanceof Error ? e.message : e}` };
  }
}

/** The school at a saved pick's coordinates (picks only store lat/lon/name). */
export async function schoolAt(p: LatLon, origin: LatLon): Promise<Candidate | undefined> {
  try {
    const s = (await loadSchools()).schools.find((x) => Math.abs(x.lat - p.lat) < 1e-5 && Math.abs(x.lon - p.lon) < 1e-5);
    return s && toCandidate(s, origin);
  } catch {
    return undefined;
  }
}
