import { describe, expect, it } from "vitest";
import { effectiveSeconds, summarize, WALK_ONLY, type MotisItinerary } from "./transit";

// Shape taken from a real Transitous response (CN Tower → College St, Toronto).
const itinerary: MotisItinerary = {
  duration: 1980,
  startTime: "2026-10-06T12:00:00Z",
  endTime: "2026-10-06T12:33:00Z",
  transfers: 0,
  legs: [
    { mode: "WALK", duration: 600, startTime: "2026-10-06T12:00:00Z", endTime: "2026-10-06T12:10:00Z" },
    {
      mode: "SUBWAY",
      duration: 300,
      startTime: "2026-10-06T12:15:00Z",
      endTime: "2026-10-06T12:20:00Z",
      displayName: "1",
    },
    { mode: "WALK", duration: 780, startTime: "2026-10-06T12:20:00Z", endTime: "2026-10-06T12:33:00Z" },
  ],
};

describe("transit", () => {
  it("drops the initial wait but keeps the rest of the trip", () => {
    // Leave home 12:05 (10 min walk before the 12:15 train), arrive 12:33.
    expect(effectiveSeconds(itinerary)).toBe(28 * 60);
  });

  it("uses the raw duration for walk-only itineraries", () => {
    expect(effectiveSeconds({ ...itinerary, legs: [itinerary.legs[0]] })).toBe(1980);
  });

  it("summarises lines and transfers", () => {
    expect(summarize(itinerary)).toBe("1");
    expect(summarize({ ...itinerary, transfers: 1, legs: [...itinerary.legs, { ...itinerary.legs[1], displayName: "504" }] })).toBe(
      "1 → 504 · 1 transfer",
    );
    expect(summarize({ ...itinerary, legs: [itinerary.legs[0]] })).toBe(WALK_ONLY);
    expect(summarize({ ...itinerary, legs: [itinerary.legs[1], itinerary.legs[1]] })).toBe("1");
  });
});
