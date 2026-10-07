import { afterEach, describe, expect, it, vi } from "vitest";
import { findPlaces, searchPhrases } from "./places";
import { clearResponseCache } from "./http";

const origin = { lat: 43.66, lon: -79.39 };
const gym = { id: "gym", label: "Gym", icon: "🏋️", tags: ["leisure=fitness_centre"] };
const result = (i: number) => ({ lat: String(43.66 + i * 0.001), lon: "-79.39", name: `Gym ${i}`, display_name: `Gym ${i}, X, Y` });

describe("searchPhrases", () => {
  it("expands alternatives and skips bare keys", () => {
    expect(searchPhrases({ ...gym, tags: ["shop=supermarket|greengrocer", "craft", "amenity=library"] })).toEqual([
      "[shop=supermarket]",
      "[shop=greengrocer]",
      "[amenity=library]",
    ]);
  });
});

describe("findPlaces", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await clearResponseCache();
  });

  /** Fake Nominatim: `perBox` results for each successive (wider) box. */
  const stubNominatim = (perBox: number[]) => {
    const boxes: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      boxes.push(new URL(url).searchParams.get("viewbox")!);
      const n = perBox[boxes.length - 1] ?? 0;
      return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => result(n - i))));
    });
    return boxes;
  };

  it("stops at the first box with any match, keeping what it found there", async () => {
    const boxes = stubNominatim([3, 9]);
    const r = await findPlaces(origin, gym);
    expect(boxes).toHaveLength(1);
    expect(r.ok && r.candidates.map((c) => c.name)).toEqual(["Gym 1", "Gym 2", "Gym 3"]);
  });

  it("widens until it has the requested minimum (show more)", async () => {
    const boxes = stubNominatim([2, 9]);
    const r = await findPlaces(origin, gym, { min: 6, max: 6 });
    expect(boxes).toHaveLength(2);
    expect(r.ok && r.candidates).toHaveLength(6);
  });

  it("explains categories it can't search", async () => {
    expect(await findPlaces(origin, { ...gym, tags: ["craft"] })).toEqual({
      ok: false,
      reason: "No searchable tags (use key=value)",
    });
  });
});
