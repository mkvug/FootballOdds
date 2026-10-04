// How the browser gets data. Normally from our own /api routes (shared server cache, one
// upstream request per TTL). If the server answers 502, meaning it could not reach ESPN, the
// browser asks ESPN directly instead and keeps doing so for a while before trying the server again.

import type { GameDetail, GamesResponse, League } from "./providers/types";

export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }
}

const REPROBE_MS = 5 * 60_000;
let direct = false;
let reprobeAt = 0;

/** Test hook. */
export function resetTransport() {
  direct = false;
  reprobeAt = 0;
}

/** JSON from our server, or null when the server could not reach ESPN. */
async function viaServer<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const res = await fetch(url, { signal });
  if (res.ok) return (await res.json()) as T;
  if (res.status === 502) return null;
  throw new HttpError(res.status);
}

const shouldTryServer = () => !direct || Date.now() >= reprobeAt;

function switchToDirect() {
  direct = true;
  reprobeAt = Date.now() + REPROBE_MS;
}

export async function fetchGames(signal?: AbortSignal): Promise<GamesResponse> {
  if (shouldTryServer()) {
    const body = await viaServer<GamesResponse>("/api/games", signal);
    if (body) {
      direct = false;
      return body;
    }
    switchToDirect();
  }
  const { directGames } = await import("./direct");
  return directGames();
}

export async function fetchGame(
  league: League,
  eventId: string,
  since: number,
  signal?: AbortSignal,
): Promise<GameDetail> {
  if (shouldTryServer()) {
    const body = await viaServer<GameDetail>(`/api/games/${league}/${eventId}?since=${since}`, signal);
    if (body) {
      direct = false;
      return body;
    }
    switchToDirect();
  }
  const { directGame } = await import("./direct");
  const game = await directGame(league, eventId).catch((err) => {
    // Same meaning as the server's 404: ESPN says there is no such game.
    if (err instanceof Error && err.name === "NotFoundError") throw new HttpError(404);
    throw err;
  });
  return { ...game, history: game.history.filter((p) => p.seq > since) };
}
