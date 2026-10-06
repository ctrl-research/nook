import { describe, expect, it } from "vitest";
import { toPlace } from "./geocode";

const base = { lat: "43.65", lon: "-79.38" };

describe("toPlace", () => {
  it("labels a plain address by number and street", () => {
    const p = toPlace({
      ...base,
      name: "",
      display_name: "100, Queen Street West, Toronto, Ontario",
      address: { house_number: "100", road: "Queen Street West", city: "Toronto" },
    });
    expect(p).toEqual({ lat: 43.65, lon: -79.38, name: "100 Queen Street West", detail: "Toronto" });
  });

  it("labels a named place by name, with its street underneath", () => {
    const p = toPlace({
      ...base,
      name: "Toronto City Hall",
      display_name: "Toronto City Hall, 100, Queen Street West, Toronto",
      address: { house_number: "100", road: "Queen Street West", city: "Toronto" },
    });
    expect(p.name).toBe("Toronto City Hall");
    expect(p.detail).toBe("100 Queen Street West, Toronto");
  });

  it("falls back to the first part of the display name", () => {
    expect(toPlace({ ...base, display_name: "Kitsilano, Vancouver" }).name).toBe("Kitsilano");
  });
});
