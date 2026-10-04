export type League = "nfl" | "ncaaf";
export type GameState = "pre" | "in" | "post";

export interface Team {
  id: string;
  /** Full name, e.g. "Kansas City Chiefs". */
  name: string;
  /** "Kansas City" */
  location: string;
  /** "Chiefs" */
  nickname: string;
  abbreviation: string;
  logoUrl: string;
  logoDarkUrl: string;
  color: string; // "#RRGGBB"
  altColor: string;
}

export interface WinProbability {
  home: number; // 0..1; home + away + tie = 1
  away: number;
  tie: number;
  source: "espn_model" | "market_devig";
  asOf: string;
}

export interface MarketOdds {
  provider: string;
  homeAmerican: number;
  awayAmerican: number;
  implied: WinProbability;
}

export interface GameSummary {
  id: string;
  league: League;
  state: GameState;
  startTime: string;
  clock: string | null;
  period: number | null;
  statusText: string;
  /** ESPN status name, e.g. STATUS_POSTPONED. Used for edge-case badges. */
  statusName: string;
  home: Team & { score: number };
  away: Team & { score: number };
  winProbability: WinProbability | null;
}

export interface ProbabilityPoint {
  seq: number;
  homeWin: number;
  tie: number;
  period?: number;
  playText?: string;
}

export interface GameDetail extends GameSummary {
  history: ProbabilityPoint[];
  market: MarketOdds | null;
  lastPlay: string | null;
  stale?: boolean;
  /** When our server last pulled this payload from ESPN. */
  fetchedAt: string;
}

export interface ScoreboardProvider {
  listGames(league: League, date?: string): Promise<GameSummary[]>;
  getGame(league: League, eventId: string): Promise<GameDetail>;
}

export class NotFoundError extends Error {
  constructor(message = "Game not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface GamesResponse {
  games: GameSummary[];
  /** True when any league is served from stale cache or failed to load. */
  stale: boolean;
  failed: League[];
  fetchedAt: string;
}
