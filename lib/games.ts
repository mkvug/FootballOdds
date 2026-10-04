// Cached service layer over the provider. Routes and server components go through here,
// so each upstream URL is fetched at most once per TTL however many viewers there are.

import { cached, type Cached } from "./cache";
import { POLL, SERVER } from "./config";
import { espnProvider } from "./providers/espn";
import type { GameDetail, GameSummary, League } from "./providers/types";

const provider = espnProvider;
const IMMINENT_MS = 10 * 60_000;

function isImminent(g: GameSummary, windowMs: number) {
  return g.state === "pre" && new Date(g.startTime).getTime() - Date.now() <= windowMs;
}

function listTtl(games: GameSummary[]) {
  const active = games.some((g) => g.state === "in" || isImminent(g, IMMINENT_MS));
  return active ? SERVER.ttlListMs : SERVER.ttlIdleListMs;
}

function gameTtl(g: GameDetail) {
  if (g.state === "in") return SERVER.ttlLiveMs;
  if (g.state === "post") return SERVER.ttlFinalMs;
  if (g.statusName && g.statusName !== "STATUS_SCHEDULED") return POLL.suspendedMs;
  return isImminent(g, POLL.nearKickoffWindowMs) ? SERVER.ttlLiveMs : SERVER.ttlPreGameMs;
}

export function getGame(league: League, eventId: string): Promise<Cached<GameDetail>> {
  return cached(`game:${league}:${eventId}`, gameTtl, () => provider.getGame(league, eventId));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Live games whose scoreboard row has no model probability get it from the game summary. */
async function enrichLive(games: GameSummary[]): Promise<GameSummary[]> {
  return mapLimit(games, 6, async (g) => {
    if (g.state !== "in" || g.winProbability?.source === "espn_model") return g;
    try {
      const { value } = await getGame(g.league, g.id);
      return value.winProbability ? { ...g, winProbability: value.winProbability } : g;
    } catch {
      return g;
    }
  });
}

export function listGames(league: League): Promise<Cached<GameSummary[]>> {
  return cached(`list:${league}`, listTtl, async () =>
    enrichLive(await provider.listGames(league)),
  );
}
