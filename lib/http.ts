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

/**
 * Short, non-sensitive description of why an upstream call failed (HTTP status, timeout,
 * DNS/connection code), for logs and the 502 body so a deployment can be diagnosed from the URL alone.
 */
export function describeFailure(err: unknown): string {
  if (!(err instanceof Error)) return "unknown error";
  const cause = err.cause as { code?: string; message?: string } | undefined;
  const extra = cause?.code ?? cause?.message;
  const base = err.name === "TimeoutError" ? "timed out talking to ESPN" : err.message;
  return (extra ? `${base} (${extra})` : base).slice(0, 200);
}
