import { afterEach, describe, expect, it, vi } from "vitest";
import { TableBatcher } from "./routing";

const origin = { lat: 43.66, lon: -79.39 };
const dest = (i: number) => ({ lat: 43.66 + i / 100, lon: -79.39 });
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Fake Valhalla matrix: answers each target with time = 60 × destination index. */
function stubOsrm() {
  const calls: number[] = [];
  let release: () => void = () => {};
  let gate = Promise.resolve();
  vi.stubGlobal("fetch", async (url: string) => {
    const body = JSON.parse(new URL(url).searchParams.get("json")!) as { targets: { lat: number }[] };
    calls.push(body.targets.length);
    await gate;
    const row = body.targets.map((t) => ({ time: Math.round((t.lat - 43.66) * 6000), distance: 1 }));
    return new Response(JSON.stringify({ sources_to_targets: [row] }));
  });
  return {
    calls,
    hold: () => (gate = new Promise((r) => (release = r))),
    release: () => release(),
  };
}

describe("TableBatcher", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends simultaneous lookups as one request", async () => {
    const osrm = stubOsrm();
    const b = new TableBatcher("walk", 5);
    const results = await Promise.all([1, 2, 3].map((i) => b.request(origin, dest(i))));
    expect(osrm.calls).toEqual([3]);
    expect(results.map((r) => r.status === "ok" && r.trip.seconds)).toEqual([60, 120, 180]);
    expect(results[0].status === "ok" && results[0].trip.meters).toBe(1000);
  });

  it("queues lookups made while a request is in flight into the next single request", async () => {
    const osrm = stubOsrm();
    const b = new TableBatcher("walk", 5);
    osrm.hold();
    const first = b.request(origin, dest(1));
    await tick(50); // first request is now in flight
    const later = [2, 3, 4].map((i) => b.request(origin, dest(i)));
    await tick(5);
    osrm.release();
    await Promise.all([first, ...later]);
    expect(osrm.calls).toEqual([1, 3]);
  });

  it("doesn't re-request a destination it already knows", async () => {
    const osrm = stubOsrm();
    const b = new TableBatcher("car", 5);
    await b.request(origin, dest(1));
    await b.request(origin, dest(1));
    expect(osrm.calls).toEqual([1]);
  });
});
