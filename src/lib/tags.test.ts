import { describe, expect, it } from "vitest";
import { matchesTags, parseTagSpec, toOverpassFilter } from "./tags";

describe("parseTagSpec", () => {
  it("parses key=value, alternatives and bare keys", () => {
    expect(parseTagSpec("amenity=school")).toEqual({ key: "amenity", values: ["school"] });
    expect(parseTagSpec(" shop = supermarket | greengrocer ")).toEqual({ key: "shop", values: ["supermarket", "greengrocer"] });
    expect(parseTagSpec("addr:street")).toEqual({ key: "addr:street", values: null });
  });

  it("rejects malformed specs", () => {
    expect(parseTagSpec("")).toBeNull();
    expect(parseTagSpec("a=b=c")).toBeNull();
    expect(parseTagSpec("has space=x")).toBeNull();
  });
});

describe("toOverpassFilter", () => {
  it("builds exact, regex and existence filters", () => {
    expect(toOverpassFilter({ key: "leisure", values: ["park"] })).toBe('["leisure"="park"]');
    expect(toOverpassFilter({ key: "shop", values: ["supermarket", "greengrocer"] })).toBe(
      '["shop"~"^(supermarket|greengrocer)$"]',
    );
    expect(toOverpassFilter({ key: "wheelchair", values: null })).toBe('["wheelchair"]');
  });

  it("escapes quotes and regex characters", () => {
    expect(toOverpassFilter({ key: "name", values: ['a"b'] })).toBe('["name"="a\\"b"]');
    expect(toOverpassFilter({ key: "k", values: ["a.b", "c"] })).toBe('["k"~"^(a\\\\.b|c)$"]');
  });
});

describe("matchesTags", () => {
  it("matches values and bare keys", () => {
    expect(matchesTags({ key: "shop", values: ["supermarket"] }, { shop: "supermarket" })).toBe(true);
    expect(matchesTags({ key: "shop", values: ["supermarket"] }, { shop: "bakery" })).toBe(false);
    expect(matchesTags({ key: "shop", values: null }, { shop: "bakery" })).toBe(true);
    expect(matchesTags({ key: "shop", values: null }, undefined)).toBe(false);
  });
});
