import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearResponseCache, fetchJson } from "./http";

/** Minimal in-memory stand-in for the browser's Cache Storage. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    const url = (r: RequestInfo | URL) => (typeof r === "string" ? r : r instanceof URL ? r.href : r.url);
    return {
      match: async (r: RequestInfo | URL) => store.get(url(r))?.clone(),
      put: async (r: RequestInfo | URL, res: Response) => void store.set(url(r), res),
      delete: async (r: RequestInfo | URL) => store.delete(url(r)),
      keys: async () => [...store.keys()].map((u) => new Request(u)),
    };
  };
  return { open, delete: async (name: string) => stores.delete(name) };
}

const settle = () => new Promise((r) => setTimeout(r, 10));

describe("persistent response cache", () => {
  let calls = 0;
  beforeEach(() => {
    calls = 0;
    vi.stubGlobal("caches", fakeCaches());
    vi.stubGlobal("fetch", async () => {
      calls++;
      return new Response(JSON.stringify({ n: calls }));
    });
  });
  afterEach(async () => {
    await clearResponseCache();
    vi.unstubAllGlobals();
  });

  // `cache: false` skips the in-memory layer, standing in for a page reload.
  it("serves a stored response instead of refetching", async () => {
    expect(await fetchJson("https://x.test/a", { cache: false, persistMs: 60_000 })).toEqual({ n: 1 });
    await settle();
    expect(await fetchJson("https://x.test/a", { cache: false, persistMs: 60_000 })).toEqual({ n: 1 });
    expect(calls).toBe(1);
  });

  it("refetches once an entry expires", async () => {
    await fetchJson("https://x.test/b", { cache: false, persistMs: 1 });
    await settle();
    expect(await fetchJson("https://x.test/b", { cache: false, persistMs: 1 })).toEqual({ n: 2 });
  });

  it("never stores rejected responses", async () => {
    await expect(fetchJson("https://x.test/c", { cache: false, persistMs: 60_000, accept: () => false })).rejects.toThrow();
    await settle();
    expect(await fetchJson("https://x.test/c", { cache: false, persistMs: 60_000 })).toEqual({ n: 2 });
  });

  it("is a plain fetch when Cache Storage is unavailable", async () => {
    vi.stubGlobal("caches", undefined);
    await fetchJson("https://x.test/d", { cache: false, persistMs: 60_000 });
    await fetchJson("https://x.test/d", { cache: false, persistMs: 60_000 });
    expect(calls).toBe(2);
  });
});
