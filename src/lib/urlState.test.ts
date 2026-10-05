import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORY_IDS } from "../config/categories";
import { decodeState, defaultDeparture, encodeState, toLocalInput } from "./urlState";

describe("url state", () => {
  it("uses default categories for an empty hash", () => {
    const s = decodeState("");
    expect(s.origin).toBeNull();
    expect(s.categories.map((c) => c.id)).toEqual(DEFAULT_CATEGORY_IDS);
    expect(s.pins).toEqual([]);
    expect(s.depart).toBeNull();
  });

  it("keeps the default setup out of the URL", () => {
    expect(encodeState(decodeState(""))).toBe("");
  });

  it("round-trips origin, presets, custom categories, pins and departure", () => {
    const s = decodeState("");
    s.origin = { lat: 43.642567, lon: -79.387087, name: "CN Tower" };
    s.categories = [
      s.categories[1],
      { id: "x-climbing", label: "Climbing", icon: "🧗", tags: ["sport=climbing"] },
    ];
    s.pins = [{ id: "0", label: "Office", place: { lat: 43.65, lon: -79.38, name: "1 King St" } }];
    s.depart = "2026-10-06T08:00";
    s.choices = { "x-climbing": { lat: 43.66, lon: -79.4, name: "Boulderz" } };

    const back = decodeState(`#${encodeState(s)}`);
    expect(back.origin).toEqual({ lat: 43.64257, lon: -79.38709, name: "CN Tower" });
    expect(back.categories).toEqual(s.categories);
    expect(back.pins).toEqual(s.pins);
    expect(back.depart).toBe("2026-10-06T08:00");
    expect(back.choices).toEqual(s.choices);
  });

  it("ignores garbage instead of throwing", () => {
    const s = decodeState("#o=abc&c=gym,nope&cx={bad&p=[[1]]");
    expect(s.origin).toBeNull();
    expect(s.categories.map((c) => c.id)).toEqual(["gym"]);
    expect(s.pins).toEqual([]);
  });

  it("drops picks for categories that are no longer active", () => {
    const s = decodeState('#c=gym&ch={"gym":[43.6,-79.4,"A"],"park":[43.6,-79.4,"B"]}');
    expect(Object.keys(s.choices)).toEqual(["gym"]);
  });
});

describe("defaultDeparture", () => {
  it("picks today at 8 on a weekday morning", () => {
    expect(toLocalInput(defaultDeparture(new Date(2026, 9, 5, 6, 0)))).toBe("2026-10-05T08:00");
  });

  it("rolls past 8am and weekends", () => {
    expect(toLocalInput(defaultDeparture(new Date(2026, 9, 5, 9, 0)))).toBe("2026-10-06T08:00");
    expect(toLocalInput(defaultDeparture(new Date(2026, 9, 9, 12, 0)))).toBe("2026-10-12T08:00"); // Fri → Mon
  });
});
