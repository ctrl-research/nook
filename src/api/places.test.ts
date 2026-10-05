import { describe, expect, it, vi } from "vitest";
import { buildOverpassQuery, findCandidates } from "./places";

describe("buildOverpassQuery", () => {
  it("unions every filter around the origin and asks for centroids", () => {
    const q = buildOverpassQuery({ lat: 43.6426, lon: -79.3871 }, 1500, [
      { key: "leisure", values: ["park"] },
      { key: "shop", values: ["supermarket", "greengrocer"] },
    ]);
    expect(q).toBe(
      '[out:json][timeout:25];(nwr["leisure"="park"](around:1500,43.642600,-79.387100);' +
        'nwr["shop"~"^(supermarket|greengrocer)$"](around:1500,43.642600,-79.387100););out center tags;',
    );
  });
});

describe("findCandidates", () => {
  const origin = { lat: 43.66, lon: -79.39 };
  const gym = { id: "gym", label: "Gym", icon: "🏋️", tags: ["leisure=fitness_centre"] };
  const element = (i: number) => ({ lat: 43.66 + i * 0.001, lon: -79.39, tags: { leisure: "fitness_centre", name: `Gym ${i}` } });

  it("widens the radius until it has enough options, nearest first", async () => {
    const radii: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const query = new URLSearchParams(String(init.body)).get("data")!;
      const radius = /around:(\d+)/.exec(query)![1];
      radii.push(radius);
      const count = radius === "1500" ? 2 : 9;
      return new Response(JSON.stringify({ elements: Array.from({ length: count }, (_, i) => element(count - i)) }));
    });
    try {
      const result = (await findCandidates(origin, [gym], 6)).get("gym");
      expect(radii).toEqual(["1500", "5000"]);
      expect(result?.ok && result.candidates.map((c) => c.name)).toEqual(["Gym 1", "Gym 2", "Gym 3", "Gym 4", "Gym 5", "Gym 6"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
