import { describe, expect, it } from "vitest";
import { decodePolyline, formatDistance, formatDuration, haversine } from "./geo";

describe("haversine", () => {
  it("measures a known distance (CN Tower → Union Station ≈ 700 m)", () => {
    const d = haversine({ lat: 43.6426, lon: -79.3871 }, { lat: 43.6453, lon: -79.3806 });
    expect(d).toBeGreaterThan(550);
    expect(d).toBeLessThan(700);
  });

  it("is zero for the same point", () => {
    expect(haversine({ lat: 1, lon: 2 }, { lat: 1, lon: 2 })).toBe(0);
  });
});

describe("decodePolyline", () => {
  it("decodes the reference example from the Google polyline docs", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it("honours precision", () => {
    const [[lat, lon]] = decodePolyline("_p~iF~ps|U", 6);
    expect(lat).toBeCloseTo(3.85);
    expect(lon).toBeCloseTo(-12.02);
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(20)).toBe("1 min");
    expect(formatDuration(14 * 60)).toBe("14 min");
    expect(formatDuration(60 * 60)).toBe("1 h");
    expect(formatDuration(95 * 60)).toBe("1 h 35");
  });

  it("formats distances", () => {
    expect(formatDistance(234)).toBe("230 m");
    expect(formatDistance(2345)).toBe("2.3 km");
    expect(formatDistance(23_456)).toBe("23 km");
  });
});
