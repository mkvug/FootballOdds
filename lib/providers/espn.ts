import { z } from "zod";
import { SERVER } from "@/lib/config";
import { periodLabel } from "@/lib/format";
import { devig, parseAmerican } from "@/lib/odds";
import { normalizeHex } from "@/lib/colors";
import {
  NotFoundError,
  type GameDetail,
  type GameState,
  type GameSummary,
  type League,
  type MarketOdds,
  type ProbabilityPoint,
  type ScoreboardProvider,
  type Team,
  type WinProbability,
} from "./types";

// ESPN_BASE_URL lets the E2E suite point the app at a local mock.
const BASE =
  process.env.ESPN_BASE_URL ?? "https://site.api.espn.com/apis/site/v2/sports/football";
const PATH: Record<League, string> = { nfl: "nfl", ncaaf: "college-football" };

// ---------------------------------------------------------------- schemas
// Only fields we rely on are required. Anything we read defensively (odds,
// situation) is left loose so ESPN adding or reshaping it can't break the list.

const TeamZ = z.object({
  id: z.string(),
  displayName: z.string(),
  location: z.string().optional(),
  name: z.string().optional(),
  abbreviation: z.string().optional(),
  color: z.string().optional(),
  alternateColor: z.string().optional(),
  logo: z.string().optional(),
  logos: z
    .array(z.object({ href: z.string(), rel: z.array(z.string()).optional() }))
    .optional(),
});

const StatusZ = z.object({
  displayClock: z.string().optional(),
  period: z.number().optional(),
  type: z.object({
    name: z.string().optional(),
    state: z.enum(["pre", "in", "post"]),
    shortDetail: z.string().optional(),
    detail: z.string().optional(),
  }),
});

const CompetitorZ = z.object({
  homeAway: z.enum(["home", "away"]),
  score: z.union([z.string(), z.number()]).optional(),
  team: TeamZ,
});

const EventZ = z.object({
  id: z.string(),
  date: z.string(),
  status: StatusZ.optional(),
  competitions: z
    .array(
      z.object({
        status: StatusZ.optional(),
        competitors: z.array(CompetitorZ).min(2),
        odds: z.array(z.any()).optional(),
        situation: z.any().optional(),
      }),
    )
    .min(1),
});

const ScoreboardZ = z.object({ events: z.array(z.unknown()) });

const PlayZ = z.object({
  id: z.string(),
  text: z.string().optional(),
  period: z.object({ number: z.number() }).optional(),
  clock: z.object({ displayValue: z.string().optional() }).optional(),
});
const DriveZ = z.object({ plays: z.array(PlayZ).optional() });

const SummaryZ = z.object({
  header: z.object({
    competitions: z
      .array(
        z.object({
          date: z.string().optional(),
          status: StatusZ,
          competitors: z.array(CompetitorZ).min(2),
        }),
      )
      .min(1),
  }),
  winprobability: z
    .array(
      z.object({
        homeWinPercentage: z.number(),
        tiePercentage: z.number().optional(),
        playId: z.string().optional(),
      }),
    )
    .optional(),
  drives: z
    .object({ previous: z.array(DriveZ).optional(), current: DriveZ.optional() })
    .optional(),
  pickcenter: z.array(z.any()).optional(),
});

type TeamRaw = z.infer<typeof TeamZ>;
type StatusRaw = z.infer<typeof StatusZ>;
type CompetitorRaw = z.infer<typeof CompetitorZ>;

// ---------------------------------------------------------------- helpers

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function dig(obj: unknown, ...path: string[]): unknown {
  let cur = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export { periodLabel };

function toTeam(t: TeamRaw): Team {
  const logo =
    t.logo ??
    t.logos?.find((l) => l.rel?.includes("default"))?.href ??
    t.logos?.[0]?.href ??
    "";
  const dark =
    t.logos?.find((l) => l.rel?.includes("dark"))?.href ??
    logo.replace("/500/", "/500-dark/");
  const color = normalizeHex(t.color);
  return {
    id: t.id,
    name: t.displayName,
    location: t.location ?? t.displayName,
    nickname: t.name ?? t.displayName,
    abbreviation: t.abbreviation ?? t.displayName.slice(0, 3).toUpperCase(),
    logoUrl: logo,
    logoDarkUrl: dark,
    color,
    altColor: normalizeHex(t.alternateColor, color),
  };
}

function toSide(c: CompetitorRaw) {
  return { ...toTeam(c.team), score: Number(c.score ?? 0) || 0 };
}

function describeStatus(status: StatusRaw, fallbackClock?: string, fallbackPeriod?: number) {
  const { state, name, shortDetail, detail } = status.type;
  const clock = status.displayClock ?? fallbackClock ?? null;
  const period = status.period ?? fallbackPeriod ?? null;
  let statusText = shortDetail ?? detail ?? "";
  if (state === "in") {
    if (name === "STATUS_HALFTIME") statusText = "Halftime";
    else if (period && period > 0 && clock) statusText = `${periodLabel(period)} · ${clock}`;
    else if (!statusText) statusText = "Live";
  }
  return { state: state as GameState, statusText, statusName: name ?? "", clock, period };
}

function winProbabilityFrom(
  home: number,
  tie: number,
  source: WinProbability["source"],
  asOf: string,
): WinProbability {
  const h = clamp01(home);
  const t = clamp01(tie);
  return { home: h, tie: t, away: clamp01(1 - h - t), source, asOf };
}

function marketFromMoneylines(
  provider: string,
  homeRaw: unknown,
  awayRaw: unknown,
  asOf: string,
): MarketOdds | null {
  const homeAmerican = parseAmerican(homeRaw);
  const awayAmerican = parseAmerican(awayRaw);
  if (homeAmerican === null || awayAmerican === null) return null;
  const [home] = devig(homeAmerican, awayAmerican);
  return {
    provider,
    homeAmerican,
    awayAmerican,
    implied: winProbabilityFrom(home, 0, "market_devig", asOf),
  };
}

// ---------------------------------------------------------------- mappers

/** Scoreboard `odds[0]` -> market. Tries close, then current, then open. */
function marketFromScoreboardOdds(odds: unknown[] | undefined, asOf: string): MarketOdds | null {
  const o = odds?.[0];
  if (!o) return null;
  const pick = (side: "home" | "away") =>
    dig(o, "moneyline", side, "close", "odds") ??
    dig(o, "moneyline", side, "current", "odds") ??
    dig(o, "moneyline", side, "open", "odds");
  const provider = String(dig(o, "provider", "name") ?? "Sportsbook");
  return marketFromMoneylines(provider, pick("home"), pick("away"), asOf);
}

export function mapScoreboard(json: unknown, league: League, asOf: string): GameSummary[] {
  const { events } = ScoreboardZ.parse(json);
  const games: GameSummary[] = [];
  for (const raw of events) {
    const parsed = EventZ.safeParse(raw);
    if (!parsed.success) {
      console.warn("[espn] skipping unparseable scoreboard event", parsed.error.issues[0]);
      continue;
    }
    const e = parsed.data;
    const comp = e.competitions[0];
    const status = e.status ?? comp.status;
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    if (!status || !home || !away) continue;

    const lastPlayProb = dig(comp.situation, "lastPlay", "probability");
    const liveHome = dig(lastPlayProb, "homeWinPercentage");
    const liveTie = dig(lastPlayProb, "tiePercentage");

    const s = describeStatus(status);
    let winProbability: WinProbability | null = null;
    if (s.state === "in" && typeof liveHome === "number") {
      winProbability = winProbabilityFrom(
        liveHome,
        typeof liveTie === "number" ? liveTie : 0,
        "espn_model",
        asOf,
      );
    } else if (s.state !== "post") {
      winProbability = marketFromScoreboardOdds(comp.odds, asOf)?.implied ?? null;
    }

    games.push({
      id: e.id,
      league,
      state: s.state,
      startTime: e.date,
      clock: s.clock,
      period: s.period,
      statusText: s.statusText,
      statusName: s.statusName,
      home: toSide(home),
      away: toSide(away),
      winProbability,
    });
  }
  return games;
}

export function mapSummary(
  json: unknown,
  league: League,
  eventId: string,
  asOf: string,
): GameDetail {
  const s = SummaryZ.parse(json);
  const comp = s.header.competitions[0];
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) throw new Error("ESPN summary missing home/away competitor");

  // Index every play so each probability point can be labelled with its period and text.
  const playOrder: z.infer<typeof PlayZ>[] = [];
  for (const d of [...(s.drives?.previous ?? []), ...(s.drives?.current ? [s.drives.current] : [])]) {
    playOrder.push(...(d.plays ?? []));
  }
  const playById = new Map(playOrder.map((p) => [p.id, p]));
  const lastPlay = playOrder.at(-1);

  let carriedPeriod: number | undefined;
  const history: ProbabilityPoint[] = (s.winprobability ?? []).map((p, seq) => {
    const play = p.playId ? playById.get(p.playId) : undefined;
    carriedPeriod = play?.period?.number ?? carriedPeriod;
    return {
      seq,
      homeWin: clamp01(p.homeWinPercentage),
      tie: clamp01(p.tiePercentage ?? 0),
      period: carriedPeriod,
      playText: play?.text,
    };
  });

  // Points before the first indexed play have no period yet; they belong to that first period.
  const firstPeriod = history.find((p) => p.period !== undefined)?.period;
  for (const p of history) {
    if (p.period !== undefined) break;
    p.period = firstPeriod;
  }

  const status = describeStatus(comp.status, lastPlay?.clock?.displayValue, lastPlay?.period?.number);

  const pc = s.pickcenter?.[0];
  const market = pc
    ? marketFromMoneylines(
        String(dig(pc, "provider", "name") ?? "Sportsbook"),
        dig(pc, "homeTeamOdds", "moneyLine"),
        dig(pc, "awayTeamOdds", "moneyLine"),
        asOf,
      )
    : null;

  const last = history.at(-1);
  const winProbability = last
    ? winProbabilityFrom(last.homeWin, last.tie, "espn_model", asOf)
    : status.state === "post"
      ? null
      : (market?.implied ?? null);

  return {
    id: eventId,
    league,
    state: status.state,
    startTime: comp.date ?? "",
    clock: status.clock,
    period: status.period,
    statusText: status.statusText,
    statusName: status.statusName,
    home: toSide(home),
    away: toSide(away),
    winProbability,
    history,
    market,
    lastPlay: lastPlay?.text ?? null,
    fetchedAt: asOf,
  };
}

// ---------------------------------------------------------------- provider

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": SERVER.userAgent, Accept: "application/json" },
    signal: AbortSignal.timeout(SERVER.fetchTimeoutMs),
    cache: "no-store",
  });
  if (res.status >= 400 && res.status < 500) throw new NotFoundError(`ESPN ${res.status}`);
  if (!res.ok) throw new Error(`ESPN responded ${res.status}`);
  return res.json();
}

export const espnProvider: ScoreboardProvider = {
  async listGames(league, date) {
    const qs = new URLSearchParams(
      league === "ncaaf" ? { groups: "80", limit: "300" } : { limit: "100" },
    );
    if (date) qs.set("dates", date);
    const json = await fetchJson(`${BASE}/${PATH[league]}/scoreboard?${qs}`);
    return mapScoreboard(json, league, new Date().toISOString());
  },

  async getGame(league, eventId) {
    if (!/^\d+$/.test(eventId)) throw new NotFoundError();
    const json = await fetchJson(`${BASE}/${PATH[league]}/summary?event=${eventId}`);
    return mapSummary(json, league, eventId, new Date().toISOString());
  },
};
