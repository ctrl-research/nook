import { describe, expect, it } from "vitest";
import { Limiter, mapLimit, Pacer, SkippedError } from "./http";

describe("Pacer", () => {
  it("spaces tasks out", async () => {
    const pacer = new Pacer(30);
    const starts: number[] = [];
    const t0 = Date.now();
    await Promise.all([1, 2, 3].map(() => pacer.schedule(async () => starts.push(Date.now() - t0))));
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(25);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(25);
  });

  it("skips unwanted tasks without spending a slot", async () => {
    const pacer = new Pacer(200);
    const ran: string[] = [];
    const a = pacer.schedule(async () => ran.push("a"));
    const b = pacer.schedule(async () => ran.push("b"), () => false);
    const t0 = Date.now();
    const c = pacer.schedule(async () => ran.push("c"));
    await expect(b).rejects.toBeInstanceOf(SkippedError);
    await Promise.all([a, c]);
    expect(ran).toEqual(["a", "c"]);
    // One interval (after a), not two.
    expect(Date.now() - t0).toBeLessThan(350);
  });
});

describe("mapLimit", () => {
  it("keeps order and caps concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 3, 2], 2, async (n) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, n * 5));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 30, 20]);
    expect(peak).toBe(2);
  });
});

describe("Limiter", () => {
  it("never runs more than its max at once, across callers", async () => {
    const limiter = new Limiter(2);
    let inFlight = 0;
    let peak = 0;
    await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        limiter.run(async () => {
          peak = Math.max(peak, ++inFlight);
          await new Promise((r) => setTimeout(r, 5));
          inFlight--;
        }),
      ),
    );
    expect(peak).toBe(2);
  });
});
