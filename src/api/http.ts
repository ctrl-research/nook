/**
 * Small fetch helpers shared by the API clients: timeouts, per-host pacing
 * (public OSM services ask for low request rates), an in-memory cache so
 * re-renders and repeat lookups don't hit the network, and optional persistence
 * across reloads (see persistentCache.ts).
 */
import { clearCached, readCached, writeCached } from "./persistentCache";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Thrown for a queued request that nobody is waiting on any more. */
export class SkippedError extends Error {
  constructor() {
    super("Request no longer needed");
  }
}

/** Serialises requests to a host so consecutive calls start at least `minIntervalMs` apart. */
export class Pacer {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly minIntervalMs: number) {}

  /** `stillWanted` is checked when the task's turn comes; skipped tasks don't use up a slot. */
  schedule<T>(task: () => Promise<T>, stillWanted: () => boolean = () => true): Promise<T> {
    const run = this.tail.then(() => {
      if (!stillWanted()) throw new SkippedError();
      return task();
    });
    const pause = () => wait(this.minIntervalMs);
    this.tail = run.then(pause, (e) => (e instanceof SkippedError ? undefined : pause()));
    return run;
  }
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface FetchJsonOptions<T> extends Omit<RequestInit, "cache" | "signal"> {
  timeoutMs?: number;
  pacer?: Pacer;
  /** Defaults to true. Failed requests are evicted so they can be retried. */
  cache?: boolean;
  /**
   * The caller's interest in the result. Cached requests may be shared between
   * callers, so there this only lets a paced request be skipped once every
   * caller has aborted; with `cache: false` it cancels the fetch itself.
   */
  signal?: AbortSignal;
  /** Keep successful responses in the browser for this long (survives reloads). */
  persistMs?: number;
  /**
   * Treat a 200 response as a failure (e.g. Overpass reporting a server-side
   * error in the body) so it is neither returned nor cached.
   */
  accept?: (data: T) => boolean;
  /** Overrides the cache key (default: method + URL + body), e.g. to share answers across mirrors. */
  cacheKey?: string;
}

interface Entry {
  promise: Promise<unknown>;
  signals: (AbortSignal | undefined)[];
}

const cache = new Map<string, Entry>();

export function fetchJson<T>(url: string, opts: FetchJsonOptions<T> = {}): Promise<T> {
  const { timeoutMs = 20_000, pacer, cache: useCache = true, signal, persistMs, accept, cacheKey, ...init } = opts;
  const key = cacheKey ?? `${init.method ?? "GET"} ${url} ${typeof init.body === "string" ? init.body : ""}`;
  const hit = useCache ? cache.get(key) : undefined;
  if (hit) {
    hit.signals.push(signal);
    return hit.promise as Promise<T>;
  }
  const entry: Entry = { promise: Promise.resolve(), signals: [signal] };
  const doFetch = async () => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const res = await fetch(url, { ...init, signal: !useCache && signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!res.ok) throw new HttpError(`${new URL(url).host} responded ${res.status}`, res.status);
    let data: T;
    try {
      data = (await res.json()) as T;
    } catch {
      throw new HttpError(`${new URL(url).host} returned an unreadable response`);
    }
    if (accept && !accept(data)) throw new HttpError(`${new URL(url).host} returned an error response`);
    if (persistMs) void writeCached(key, data, persistMs);
    return data;
  };
  const stillWanted = () => entry.signals.some((s) => !s?.aborted);
  const network = () => (pacer ? pacer.schedule(doFetch, stillWanted) : doFetch());
  // A stored response skips the network and, importantly, the pacing queue.
  const promise = persistMs ? readCached<T>(key).then((hit) => (hit !== undefined ? hit : network())) : network();
  entry.promise = promise;
  if (useCache) {
    cache.set(key, entry);
    promise.catch(() => cache.get(key) === entry && cache.delete(key));
  }
  return promise;
}

/** Forgets every cached response, in memory and in the browser. */
export async function clearResponseCache(): Promise<void> {
  cache.clear();
  await clearCached();
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
