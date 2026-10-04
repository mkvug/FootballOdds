// Browser-side equivalent of the /api routes. Loaded only when our server reports that ESPN
// is unreachable from it (e.g. ESPN's CDN returning 403 to a host's datacenter IPs), so the
// visitor's own connection talks to ESPN instead. ESPN allows this: it sends
// `access-control-allow-origin: *`. The cache and mappers are the same code the server uses.

import { LEAGUES } from "./config";
import { getGame, listGames } from "./games";
import type { GameDetail, GameSummary, GamesResponse, League } from "./providers/types";

export async function directGames(): Promise<GamesResponse> {
  const results = await Promise.allSettled(LEAGUES.map((l) => listGames(l)));
  const games: GameSummary[] = [];
  const failed: League[] = [];
  let stale = false;
  results.forEach((r, i) => {
    if (r.status === "rejected") failed.push(LEAGUES[i]);
    else {
      games.push(...r.value.value);
      stale ||= r.value.stale;
    }
  });
  if (failed.length === LEAGUES.length) throw new Error("ESPN unreachable from this browser");
  return {
    games,
    stale: stale || failed.length > 0,
    failed,
    fetchedAt: new Date().toISOString(),
  };
}

export async function directGame(league: League, eventId: string): Promise<GameDetail> {
  const { value, stale } = await getGame(league, eventId);
  return { ...value, stale: stale || undefined };
}
