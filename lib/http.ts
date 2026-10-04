import { LEAGUES } from "./config";
import type { League } from "./providers/types";

export const isLeague = (v: string): v is League => (LEAGUES as readonly string[]).includes(v);

/** Shared caches may hold the response for the remaining server TTL; browsers always revalidate. */
export function cacheHeaders(ttlMs: number, stale: boolean): HeadersInit {
  const seconds = stale ? 0 : Math.max(0, Math.floor(ttlMs / 1000));
  return {
    "Cache-Control":
      seconds > 0 ? `public, max-age=0, s-maxage=${seconds}` : "no-store",
  };
}
