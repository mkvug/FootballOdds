// Small TTL cache with in-flight de-duplication (spec N2) and stale fallback (spec §9).
// Kept on globalThis so dev hot-reloads don't drop it.

interface Entry {
  value: unknown;
  expires: number;
}

const MAX_ENTRIES = 500;

const g = globalThis as unknown as {
  __fbStore?: Map<string, Entry>;
  __fbInflight?: Map<string, Promise<unknown>>;
};
const store = (g.__fbStore ??= new Map());
const inflight = (g.__fbInflight ??= new Map());

export interface Cached<T> {
  value: T;
  stale: boolean;
  /** Seconds the response can be shared-cached for. */
  ttlMs: number;
}

export async function cached<T>(
  key: string,
  ttl: number | ((value: T) => number),
  load: () => Promise<T>,
): Promise<Cached<T>> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) {
    return { value: hit.value as T, stale: false, ttlMs: hit.expires - now };
  }

  let pending = inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = load()
      .then((value) => {
        const ms = typeof ttl === "function" ? ttl(value) : ttl;
        store.delete(key);
        store.set(key, { value, expires: Date.now() + ms });
        while (store.size > MAX_ENTRIES) {
          const oldest = store.keys().next().value;
          if (oldest === undefined) break;
          store.delete(oldest);
        }
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }

  try {
    const value = await pending;
    const entry = store.get(key);
    return { value, stale: false, ttlMs: entry ? entry.expires - Date.now() : 0 };
  } catch (err) {
    if (hit) return { value: hit.value as T, stale: true, ttlMs: 0 };
    throw err;
  }
}

export function clearCache() {
  store.clear();
  inflight.clear();
}
