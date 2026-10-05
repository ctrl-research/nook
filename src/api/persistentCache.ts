/**
 * Browser-side response cache that survives reloads, so revisiting a setup
 * doesn't re-query the public services. Uses Cache Storage (large quota, unlike
 * localStorage's ~5 MB). Everything is best-effort: when storage is unavailable
 * (private windows, blocked site data, Node in tests) reads miss and writes no-op.
 */

const STORE = "nook-responses-v1";
const EXPIRES_HEADER = "x-nook-expires";

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

function storage(): CacheStorage | null {
  try {
    return typeof caches === "undefined" ? null : caches;
  } catch {
    return null;
  }
}

/** Cache Storage keys must be GET URLs, so hash the request (incl. POST body) into one. */
async function keyUrl(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `https://cache.nook.invalid/${hex}`;
}

export async function readCached<T>(key: string): Promise<T | undefined> {
  const store = storage();
  if (!store) return undefined;
  try {
    const cache = await store.open(STORE);
    const url = await keyUrl(key);
    const res = await cache.match(url);
    if (!res) return undefined;
    if (!(Number(res.headers.get(EXPIRES_HEADER)) > Date.now())) {
      void cache.delete(url);
      return undefined;
    }
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

export async function writeCached(key: string, data: unknown, ttlMs: number): Promise<void> {
  const store = storage();
  if (!store) return;
  try {
    const cache = await store.open(STORE);
    const headers = { "content-type": "application/json", [EXPIRES_HEADER]: String(Date.now() + ttlMs) };
    await cache.put(await keyUrl(key), new Response(JSON.stringify(data), { headers }));
  } catch {
    // Quota exceeded or storage blocked: the app still works, just uncached.
  }
}

/** Drops expired entries so the store doesn't grow forever. Safe to call on startup. */
export async function pruneExpired(): Promise<void> {
  const store = storage();
  if (!store) return;
  try {
    const cache = await store.open(STORE);
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      if (!(Number(res?.headers.get(EXPIRES_HEADER)) > Date.now())) await cache.delete(req);
    }
  } catch {
    // Best-effort.
  }
}

export async function clearCached(): Promise<void> {
  try {
    await storage()?.delete(STORE);
  } catch {
    // Best-effort.
  }
}
