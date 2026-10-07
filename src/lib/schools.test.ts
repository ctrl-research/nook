import { describe, expect, it } from "vitest";
import { schoolSummary, versusAverage } from "./schools";
import { parseSchools, nearestSchools } from "../api/schools";
import type { SchoolInfo } from "../types";

const scores = { g3r: null, g3w: null, g3m: null, g6r: null, g6w: null, g6m: null, g9m: null, osslt: null };
const info = (level: SchoolInfo["level"], s: Partial<SchoolInfo["scores"]>): SchoolInfo => ({
  id: "1",
  level,
  type: "Public",
  language: "English",
  grades: "JK-8",
  board: "Toronto DSB",
  enrolment: 300,
  scores: { ...scores, ...s },
});

describe("schoolSummary", () => {
  it("headlines grade 6 for elementary schools", () => {
    expect(schoolSummary(info("elementary", { g3r: 70, g6r: 85, g6m: 52 }))).toBe("Gr 6 reading 85% · Gr 6 math 52%");
  });

  it("falls back to grade 3 when grade 6 isn't reported", () => {
    expect(schoolSummary(info("elementary", { g3r: 78, g3w: 70, g3m: 60 }))).toBe("Gr 3 reading 78% · Gr 3 writing 70%");
  });

  it("headlines grade 9 math and grade 10 literacy for secondary schools", () => {
    expect(schoolSummary(info("secondary", { g9m: 60, osslt: 91 }))).toBe("Gr 9 math 60% · Gr 10 literacy 91%");
  });

  it("says when nothing is reported", () => {
    expect(schoolSummary(info("secondary", {}))).toBe("EQAO results not reported");
  });
});

describe("versusAverage", () => {
  it("allows a few points either way before calling it above or below", () => {
    expect(versusAverage(80, 70)).toBe("above");
    expect(versusAverage(60, 70)).toBe("below");
    expect(versusAverage(72, 70)).toBe("near");
    expect(versusAverage(72, null)).toBe("near");
  });
});

describe("school data", () => {
  const file = {
    extracted: "18/August/2026",
    ontarioAverage: { ...scores, g6r: 85 },
    fields: ["id", "name", "level", "type", "language", "grades", "board", "street", "city", "website", "enrolment", "lat", "lon", "g3r", "g3w", "g3m", "g6r", "g6w", "g6m", "g9m", "osslt"],
    schools: [
      ["1", "Near Elementary", "E", "Public", "English", "JK-8", "TDSB", "1 A St", "Toronto", "www.a.ca", 300, 43.661, -79.39, 70, 60, 50, 80, 75, 45, null, null],
      ["2", "Far Secondary", "S", "Catholic", "English", "9-12", "TCDSB", "2 B St", "Toronto", "NA", 900, 43.7, -79.39, null, null, null, null, null, null, 55, 88],
    ],
  };

  it("parses rows into schools with scores and tidy websites", () => {
    const data = parseSchools(file);
    expect(data.schools[0].info.website).toBe("https://www.a.ca");
    expect(data.schools[1].info.website).toBeUndefined();
    expect(data.schools[1].info.scores.osslt).toBe(88);
    expect(data.schools[1].info.level).toBe("secondary");
  });

  it("finds the nearest schools, optionally by level", () => {
    const data = parseSchools(file);
    const origin = { lat: 43.66, lon: -79.39 };
    expect(nearestSchools(data, origin, { max: 6 }).map((c) => c.name)).toEqual(["Near Elementary", "Far Secondary"]);
    expect(nearestSchools(data, origin, { level: "secondary", max: 6 }).map((c) => c.name)).toEqual(["Far Secondary"]);
  });
});
