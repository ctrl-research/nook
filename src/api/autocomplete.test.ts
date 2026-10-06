import { afterEach, describe, expect, it, vi } from "vitest";
import { buildUrl, toPlace } from "./autocomplete";

describe("Geoapify autocomplete", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("labels results by first and second address line, without the country", () => {
    expect(
      toPlace({
        lat: 43.65,
        lon: -79.38,
        address_line1: "100 Queen Street West",
        address_line2: "Toronto, ON M5H 2N2, Canada",
      }),
    ).toEqual({ lat: 43.65, lon: -79.38, name: "100 Queen Street West", detail: "Toronto, ON M5H 2N2" });
  });

  it("limits to the GTA and biases towards downtown", () => {
    const q = new URL(buildUrl("100 queen", "k")).searchParams;
    expect(q.get("text")).toBe("100 queen");
    expect(q.get("filter")).toBe("rect:-80.3,43.25,-78.55,44.45");
    expect(q.get("bias")).toBe("proximity:-79.3832,43.6532");
    expect(q.get("format")).toBe("json");
    expect(q.get("apiKey")).toBe("k");
  });

  it("is off without a key", async () => {
    vi.stubEnv("VITE_GEOAPIFY_KEY", "");
    const mod = await import("./autocomplete");
    expect(mod.autocompleteEnabled()).toBe(false);
    expect(await mod.suggestAddresses("100 queen")).toEqual([]);
  });

  it("switches itself off when the key is rejected", async () => {
    vi.stubEnv("VITE_GEOAPIFY_KEY", "bad-key");
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return new Response("{}", { status: 401 });
    });
    const mod = await import("./autocomplete");
    expect(mod.autocompleteEnabled()).toBe(true);
    expect(await mod.suggestAddresses("100 queen")).toEqual([]);
    expect(mod.autocompleteEnabled()).toBe(false);
    await mod.suggestAddresses("100 queen st");
    expect(calls).toBe(1);
  });
});
