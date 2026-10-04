import { POLL } from "./config";
import type { GameDetail } from "./providers/types";

const SUSPENDED = /POSTPONED|SUSPENDED|CANCELED|CANCELLED|FORFEIT/;

export const isSuspended = (g: Pick<GameDetail, "state" | "statusName">) =>
  g.state !== "post" && SUSPENDED.test(g.statusName);

/** Double the interval per failure after the third, capped (spec §7). */
export function withBackoff(baseMs: number, failures: number): number {
  if (failures < 3) return baseMs;
  return Math.min(baseMs * 2 ** (failures - 2), POLL.maxBackoffMs);
}

/** Interval for the game view, or false when polling should stop. */
export function gameInterval(
  game: Pick<GameDetail, "state" | "statusName" | "startTime"> | undefined,
  failures: number,
  now: number,
): number | false {
  if (!game) return withBackoff(POLL.liveMs, failures);
  if (game.state === "post") return false;
  if (isSuspended(game)) return POLL.suspendedMs;
  if (game.state === "in") return withBackoff(POLL.liveMs, failures);
  const untilKickoff = new Date(game.startTime).getTime() - now;
  return withBackoff(
    untilKickoff <= POLL.nearKickoffWindowMs ? POLL.preNearKickoffMs : POLL.preMs,
    failures,
  );
}
