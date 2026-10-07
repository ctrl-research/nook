import type { SchoolInfo, SchoolScores } from "../types";

export interface Metric {
  key: keyof SchoolScores;
  label: string;
  short: string;
}

/** EQAO measures, in reading order, per school level. */
export const METRICS: Record<SchoolInfo["level"], Metric[]> = {
  elementary: [
    { key: "g3r", label: "Grade 3 reading", short: "Gr 3 reading" },
    { key: "g3w", label: "Grade 3 writing", short: "Gr 3 writing" },
    { key: "g3m", label: "Grade 3 math", short: "Gr 3 math" },
    { key: "g6r", label: "Grade 6 reading", short: "Gr 6 reading" },
    { key: "g6w", label: "Grade 6 writing", short: "Gr 6 writing" },
    { key: "g6m", label: "Grade 6 math", short: "Gr 6 math" },
  ],
  secondary: [
    { key: "g9m", label: "Grade 9 math", short: "Gr 9 math" },
    { key: "osslt", label: "Grade 10 literacy (OSSLT, first attempt)", short: "Gr 10 literacy" },
  ],
};

/** The two headline numbers shown in lists and tooltips. */
const HEADLINE: Record<SchoolInfo["level"], (keyof SchoolScores)[]> = {
  elementary: ["g6r", "g6m"],
  secondary: ["g9m", "osslt"],
};

/**
 * One-line summary, e.g. "Gr 6 reading 85% · Gr 6 math 52%". Falls back to the
 * other grade's results when the headline ones aren't reported (e.g. a JK–3 school).
 */
export function schoolSummary(info: SchoolInfo): string {
  const metrics = METRICS[info.level];
  const reported = (keys: (keyof SchoolScores)[]) =>
    keys.flatMap((k) => {
      const v = info.scores[k];
      const m = metrics.find((x) => x.key === k)!;
      return v === null ? [] : [`${m.short} ${v}%`];
    });
  const parts = reported(HEADLINE[info.level]);
  if (parts.length) return parts.join(" · ");
  const any = reported(metrics.map((m) => m.key)).slice(0, 2);
  return any.length ? any.join(" · ") : "EQAO results not reported";
}

/** Compared with the Ontario average: "above", "below" or "near" (within 3 points). */
export function versusAverage(value: number, average: number | null): "above" | "below" | "near" {
  if (average === null || Math.abs(value - average) <= 3) return "near";
  return value > average ? "above" : "below";
}

export const levelLabel = (info: SchoolInfo) =>
  `${info.level === "secondary" ? "Secondary" : "Elementary"} · ${info.type} · ${info.grades}`;
