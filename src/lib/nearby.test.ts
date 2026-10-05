import { describe, expect, it } from "vitest";
import { rankByWalk } from "./nearby";
import type { Alternative, TripResult } from "../types";

const ok = (seconds: number): TripResult => ({ status: "ok", trip: { seconds } });
const alt = (name: string, distanceM: number, walk?: TripResult): Alternative => ({ name, distanceM, lat: 0, lon: 0, walk });

describe("rankByWalk", () => {
  it("prefers the shortest walk over the shortest straight line", () => {
    const ranked = rankByWalk([alt("closest", 100, ok(900)), alt("second", 200, ok(300)), alt("third", 300, ok(600))]);
    expect(ranked.map((a) => a.name)).toEqual(["second", "third", "closest"]);
  });

  it("puts options without a route last, by distance", () => {
    const ranked = rankByWalk([
      alt("far-none", 500, { status: "none", reason: "x" }),
      alt("near-error", 100, { status: "error", reason: "down" }),
      alt("routed", 400, ok(500)),
    ]);
    expect(ranked.map((a) => a.name)).toEqual(["routed", "near-error", "far-none"]);
  });

  it("falls back to straight-line order when routing failed entirely", () => {
    const ranked = rankByWalk([alt("b", 200), alt("a", 100)]);
    expect(ranked.map((a) => a.name)).toEqual(["a", "b"]);
  });
});
