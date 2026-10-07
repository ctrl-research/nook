#!/usr/bin/env node
/**
 * Builds public/data/schools-gta.json from Ontario's open "School information
 * and student demographics" dataset (Ministry of Education; Open Government
 * Licence – Ontario): every publicly funded school in the GTA with its location
 * and EQAO results. Run with `npm run update:schools`; a monthly workflow runs
 * it too and opens a PR when the data changes.
 */
import { writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";

const DATASET = "school-information-and-student-demographics";
const CKAN = `https://data.ontario.ca/api/3/action/package_show?id=${DATASET}`;
const OUT = new URL("../public/data/schools-gta.json", import.meta.url);

// Keep in sync with src/config/region.ts.
const REGION = { south: 43.25, west: -80.3, north: 44.45, east: -78.55 };

const SCORE_COLUMNS = {
  g3r: "Percentage of Grade 3 Students Achieving the Provincial Standard in Reading",
  g3w: "Percentage of Grade 3 Students Achieving the Provincial Standard in Writing",
  g3m: "Percentage of Grade 3 Students Achieving the Provincial Standard in Mathematics",
  g6r: "Percentage of Grade 6 Students Achieving the Provincial Standard in Reading",
  g6w: "Percentage of Grade 6 Students Achieving the Provincial Standard in Writing",
  g6m: "Percentage of Grade 6 Students Achieving the Provincial Standard in Mathematics",
  g9m: "Percentage of Grade 9 Students Achieving the Provincial Standard in Mathematics",
  osslt: "Percentage of Students That Passed the Grade 10 OSSLT on Their First Attempt",
};

/** The most recently modified English data table in the dataset. */
async function latestResource() {
  const res = await fetch(CKAN);
  if (!res.ok) throw new Error(`CKAN responded ${res.status}`);
  const { result } = await res.json();
  const english = result.resources.filter((r) => /_en[^/]*\.xlsx$/i.test(r.url));
  english.sort((a, b) => String(b.last_modified ?? b.created).localeCompare(String(a.last_modified ?? a.created)));
  if (!english.length) throw new Error("No English XLSX resource found");
  return { url: english[0].url, name: english[0].url.split("/").pop(), page: `https://data.ontario.ca/dataset/${DATASET}` };
}

const decode = (s) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+);/g, (_, e) =>
    e[0] === "#" ? String.fromCharCode(Number(e.slice(1))) : { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[e],
  );

/** Minimal XLSX reader: first sheet as rows of strings (enough for this flat table). */
function readSheet(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const strings = [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const colIndex = (ref) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const out = [];
    for (const c of row[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] ?? "")?.[1];
      const isShared = /t="s"/.test(c[2]);
      out[colIndex(c[1])] = v === undefined ? "" : isShared ? strings[Number(v)] : decode(v);
    }
    return Array.from(out, (x) => x ?? "");
  });
}

const percent = (s) => (/^\d+(\.\d+)?%$/.test(s ?? "") ? Math.round(parseFloat(s)) : null);

async function main() {
  const resource = await latestResource();
  console.log(`Downloading ${resource.name}`);
  const res = await fetch(resource.url);
  if (!res.ok) throw new Error(`Download responded ${res.status}`);
  const [header, ...rows] = readSheet(await res.arrayBuffer());
  const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const get = (row, name) => (row[col[name]] ?? "").trim();
  for (const name of ["School Number", "School Name", "Latitude", "Longitude", ...Object.values(SCORE_COLUMNS)]) {
    if (!(name in col)) throw new Error(`Missing column: ${name}`);
  }

  // Unweighted mean across all Ontario schools that report each score.
  const ontarioAverage = Object.fromEntries(
    Object.entries(SCORE_COLUMNS).map(([key, name]) => {
      const values = rows.map((r) => percent(get(r, name))).filter((v) => v !== null);
      return [key, values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null];
    }),
  );

  const fields = ["id", "name", "level", "type", "language", "grades", "board", "street", "city", "website", "enrolment", "lat", "lon", ...Object.keys(SCORE_COLUMNS)];
  const schools = rows
    .map((r) => ({ r, lat: parseFloat(get(r, "Latitude")), lon: parseFloat(get(r, "Longitude")) }))
    .filter(({ lat, lon }) => lat >= REGION.south && lat <= REGION.north && lon >= REGION.west && lon <= REGION.east)
    .map(({ r, lat, lon }) => [
      get(r, "School Number"),
      get(r, "School Name"),
      get(r, "School Level") === "Secondary" ? "S" : "E",
      get(r, "School Type"),
      get(r, "School Language"),
      get(r, "Grade Range"),
      get(r, "Board Name"),
      get(r, "Street"),
      get(r, "City"),
      get(r, "School Website"),
      Number(get(r, "Enrolment")) || null,
      Math.round(lat * 1e5) / 1e5,
      Math.round(lon * 1e5) / 1e5,
      ...Object.values(SCORE_COLUMNS).map((name) => percent(get(r, name))),
    ])
    .sort((a, b) => a[0].localeCompare(b[0]));

  const extracted = get(rows[0], "Extract Date");
  const out = {
    source: resource.page,
    file: resource.name,
    licence: "Open Government Licence – Ontario",
    extracted,
    ontarioAverage,
    fields,
    schools,
  };
  // Stable output so the monthly job only opens a PR when the data changes.
  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${schools.length} GTA schools (of ${rows.length} in Ontario), extracted ${extracted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
