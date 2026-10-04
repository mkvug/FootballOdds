// Tunables shared by server and client. Values come from spec §7 and §12.

export const LEAGUES = ["nfl", "ncaaf"] as const;

// NEXT_PUBLIC_POLL_* exist so the E2E suite can run with short intervals; unset in normal use.
const pollMs = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const POLL = {
  listMs: pollMs(process.env.NEXT_PUBLIC_POLL_LIST_MS, 30_000),
  liveMs: pollMs(process.env.NEXT_PUBLIC_POLL_LIVE_MS, 5_000),
  preMs: 60_000,
  preNearKickoffMs: 5_000,
  nearKickoffWindowMs: 5 * 60_000,
  suspendedMs: 5 * 60_000,
  maxBackoffMs: 60_000,
  delayedAfterMs: 90_000,
} as const;

export const SWING_THRESHOLD = 0.1;
export const TIE_DISPLAY_THRESHOLD = 0.01;

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const DEFAULT_UA = "FootballOdds/1.0 (personal project)";

/** Header values must be printable ASCII; a stray newline or emoji in the env var would make every fetch throw. */
export const cleanUserAgent = (raw: string | undefined) =>
  raw?.replace(/[^\x20-\x7E]/g, "").trim() || DEFAULT_UA;

export const SERVER = {
  userAgent: cleanUserAgent(process.env.ESPN_USER_AGENT),
  ttlLiveMs: num(process.env.CACHE_TTL_LIVE_S, 5) * 1000,
  ttlListMs: num(process.env.CACHE_TTL_LIST_S, 15) * 1000,
  ttlIdleListMs: num(process.env.CACHE_TTL_IDLE_S, 300) * 1000,
  ttlPreGameMs: 60_000,
  ttlFinalMs: 24 * 60 * 60_000,
  fetchTimeoutMs: 8_000,
};
