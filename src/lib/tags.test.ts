import { describe, expect, it } from "vitest";
import { isSearchable, parseTagSpec } from "./tags";

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

describe("isSearchable", () => {
  it("needs a value", () => {
    expect(isSearchable("amenity=library")).toBe(true);
    expect(isSearchable("shop=a|b")).toBe(true);
    expect(isSearchable("craft")).toBe(false);
    expect(isSearchable("nope nope")).toBe(false);
  });
});
