import { describe, expect, it } from "vitest";
import { diffRows } from "./useDestinations";

const wanted = (entries: [string, string][]) => new Map(entries.map(([k, sig]) => [k, { sig }]));

describe("diffRows", () => {
  const current = new Map([
    ["pin:a", "A"],
    ["cat:gym", "G"],
  ]);

  it("looks up only an added pin", () => {
    const { dropped, fresh } = diffRows(current, wanted([["pin:a", "A"], ["pin:b", "B"], ["cat:gym", "G"]]));
    expect(dropped).toEqual([]);
    expect(fresh.map(([k]) => k)).toEqual(["pin:b"]);
  });

  it("drops a removed row without touching the rest", () => {
    const { dropped, fresh } = diffRows(current, wanted([["cat:gym", "G"]]));
    expect(dropped).toEqual(["pin:a"]);
    expect(fresh).toEqual([]);
  });

  it("redoes a row whose inputs changed", () => {
    const { dropped, fresh } = diffRows(current, wanted([["pin:a", "A2"], ["cat:gym", "G"]]));
    expect(dropped).toEqual(["pin:a"]);
    expect(fresh.map(([k]) => k)).toEqual(["pin:a"]);
  });

  it("does nothing when nothing changed", () => {
    expect(diffRows(current, wanted([["pin:a", "A"], ["cat:gym", "G"]]))).toEqual({ dropped: [], fresh: [] });
  });
});
