import { useEffect, useState } from "react";
import type { SchoolInfo, SchoolLevel, SchoolScores } from "../types";
import { loadSchools, SCHOOLS_SOURCE } from "../api/schools";
import { levelLabel, METRICS, schoolSummary, versusAverage } from "../lib/schools";

/** Full EQAO results for the selected school, against the Ontario school average. */
export function SchoolDetails({ info }: { info: SchoolInfo }) {
  const [average, setAverage] = useState<SchoolScores | null>(null);
  const [extracted, setExtracted] = useState<string | null>(null);
  useEffect(() => {
    loadSchools()
      .then((d) => {
        setAverage(d.ontarioAverage);
        setExtracted(d.extracted);
      })
      .catch(() => {});
  }, []);

  const rows = METRICS[info.level].filter((m) => info.scores[m.key] !== null);
  return (
    <div className="school-details">
      <p className="school-meta">
        {levelLabel(info)} · {info.board}
        {info.enrolment ? ` · ~${info.enrolment} students` : ""}
      </p>
      {rows.length ? (
        <table className="school-scores">
          <caption>% of students meeting the provincial standard (EQAO)</caption>
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">School</th>
              <th scope="col">Ontario avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const v = info.scores[m.key]!;
              const avg = average?.[m.key] ?? null;
              const vs = versusAverage(v, avg);
              return (
                <tr key={m.key}>
                  <th scope="row">{m.label}</th>
                  <td className={`score ${vs}`}>
                    {v}%{vs === "above" ? " ▲" : vs === "below" ? " ▼" : ""}
                  </td>
                  <td className="avg">{avg === null ? "…" : `${avg}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="hint">{schoolSummary(info)} (e.g. too few students tested to publish).</p>
      )}
      <p className="hint">
        {info.website && (
          <>
            <a href={info.website} target="_blank" rel="noreferrer">
              School website
            </a>{" "}
            ·{" "}
          </>
        )}
        <a href={SCHOOLS_SOURCE.dataset} target="_blank" rel="noreferrer">
          Ontario open data
        </a>
        {extracted && ` (extracted ${extracted})`}. Averages are across Ontario schools that report each result.
      </p>
    </div>
  );
}

const LEVELS: { value: SchoolLevel | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "elementary", label: "Elementary" },
  { value: "secondary", label: "Secondary" },
];

export function SchoolLevelFilter({
  value,
  onChange,
}: {
  value: SchoolLevel | null;
  onChange: (level: SchoolLevel | null) => void;
}) {
  return (
    <div className="level-filter" role="radiogroup" aria-label="School level">
      {LEVELS.map((l) => (
        <button
          key={l.label}
          type="button"
          role="radio"
          aria-checked={value === l.value}
          className={value === l.value ? "on" : undefined}
          onClick={() => onChange(l.value)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
