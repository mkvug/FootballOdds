import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapScoreboard, mapSummary, periodLabel } from "@/lib/providers/espn";

const load = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "../fixtures", name), "utf8"));
const NOW = "2026-10-04T12:00:00.000Z";

describe("mapScoreboard (NFL)", () => {
  const games = mapScoreboard(load("nfl-scoreboard.json"), "nfl", NOW);

  it("maps every event", () => {
    expect(games.length).toBeGreaterThan(10);
  });

  it("maps teams, colours and logos", () => {
    const g = games.find((x) => x.home.abbreviation === "WSH")!;
    expect(g.league).toBe("nfl");
    expect(g.home.name).toBe("Washington Commanders");
    expect(g.home.nickname).toBe("Commanders");
    expect(g.home.color).toBe("#5a1414");
    expect(g.home.altColor).toBe("#ffb612");
    expect(g.home.logoUrl).toMatch(/^https:\/\/a\.espncdn\.com\//);
    expect(g.home.logoDarkUrl).toContain("/500-dark/");
  });

  it("derives pre-game probability from the de-vigged moneyline", () => {
    const g = games.find((x) => x.state === "pre")!;
    expect(g.winProbability?.source).toBe("market_devig");
    const p = g.winProbability!;
    expect(p.home + p.away + p.tie).toBeCloseTo(1, 6);
  });

  it("leaves finished games without a probability", () => {
    const g = games.find((x) => x.state === "post")!;
    expect(g.winProbability).toBeNull();
    expect(g.statusText).toBe("Final");
  });

  it("uses the model probability for live games when the scoreboard has one", () => {
    const raw = load("nfl-scoreboard.json");
    const ev = raw.events[0];
    ev.status = { ...ev.status, displayClock: "4:12", period: 3, type: { ...ev.status.type, state: "in", name: "STATUS_IN_PROGRESS" } };
    ev.competitions[0].situation = { lastPlay: { probability: { homeWinPercentage: 0.7, tiePercentage: 0.01 } } };
    const g = mapScoreboard(raw, "nfl", NOW)[0];
    expect(g.state).toBe("in");
    expect(g.statusText).toBe("Q3 · 4:12");
    expect(g.winProbability).toMatchObject({ home: 0.7, tie: 0.01, source: "espn_model" });
    expect(g.winProbability!.away).toBeCloseTo(0.29, 6);
  });

  it("skips a malformed event instead of failing the list", () => {
    const raw = load("nfl-scoreboard.json");
    const count = raw.events.length;
    raw.events.push({ id: 5 });
    expect(mapScoreboard(raw, "nfl", NOW)).toHaveLength(count);
  });
});

describe("mapScoreboard (NCAAF)", () => {
  it("maps college events", () => {
    const games = mapScoreboard(load("ncaaf-scoreboard.json"), "ncaaf", NOW);
    expect(games.length).toBeGreaterThan(0);
    expect(games[0].home.logoDarkUrl).toContain("/500-dark/");
  });
});

describe("mapSummary (finished game)", () => {
  const g = mapSummary(load("nfl-summary-post.json"), "nfl", "401872964", NOW);

  it("maps the final state and score", () => {
    expect(g.state).toBe("post");
    expect(g.statusText).toBe("Final");
    expect(g.home.abbreviation).toBe("CLE");
    expect(g.home.score).toBe(27);
    expect(g.away.score).toBe(24);
    expect(g.startTime).not.toBe("");
  });

  it("builds the full probability history in play order", () => {
    expect(g.history).toHaveLength(196);
    expect(g.history[0].seq).toBe(0);
    expect(g.history.at(-1)!.homeWin).toBe(1);
    expect(g.history.every((p, i) => p.seq === i)).toBe(true);
  });

  it("labels history points with a period", () => {
    const periods = new Set(g.history.map((p) => p.period));
    expect(periods.has(1)).toBe(true);
    expect(periods.has(4)).toBe(true);
    expect(g.history.every((p) => p.period !== undefined)).toBe(true);
  });

  it("uses the last model point as the current probability", () => {
    expect(g.winProbability).toMatchObject({ home: 1, away: 0, source: "espn_model" });
  });

  it("reads the market and last play", () => {
    expect(g.market?.provider).toBe("DraftKings");
    expect(g.market!.implied.home + g.market!.implied.away).toBeCloseTo(1, 6);
    expect(g.lastPlay).toBe("END GAME");
  });
});

describe("mapSummary (not started)", () => {
  it("falls back to the market probability when there is no model history", () => {
    const raw = load("nfl-summary-post.json");
    raw.winprobability = [];
    raw.header.competitions[0].status.type = { state: "pre", name: "STATUS_SCHEDULED", shortDetail: "10/4 - 1:00 PM EDT" };
    const g = mapSummary(raw, "nfl", "1", NOW);
    expect(g.state).toBe("pre");
    expect(g.winProbability?.source).toBe("market_devig");
  });

  it("rejects a payload without the header", () => {
    expect(() => mapSummary({}, "nfl", "1", NOW)).toThrow();
  });
});

describe("periodLabel", () => {
  it("labels regulation and overtime", () => {
    expect([1, 4, 5, 6].map(periodLabel)).toEqual(["Q1", "Q4", "OT", "2OT"]);
  });
});

// Real payloads recorded from ESPN while a game was in progress (2026-10-04, IND at WSH, Q1).
describe("live payloads recorded from ESPN", () => {
  const board = mapScoreboard(load("nfl-scoreboard-live.json"), "nfl", NOW);
  const live = board.find((g) => g.state === "in")!;

  it("maps the scoreboard row of a game in progress", () => {
    expect(live.away.abbreviation).toBe("IND");
    expect(live.home.abbreviation).toBe("WSH");
    expect(live.period).toBe(1);
    expect(live.clock).toMatch(/^\d+:\d{2}$/);
    expect(live.statusText).toBe(`Q1 · ${live.clock}`);
  });

  it("reads the model probability from situation.lastPlay.probability", () => {
    expect(live.winProbability?.source).toBe("espn_model");
    const p = live.winProbability!;
    expect(p.home + p.away + p.tie).toBeCloseTo(1, 6);
    expect(p.home).toBeGreaterThan(0.3);
    expect(p.home).toBeLessThan(0.7);
  });

  it("maps the live game summary", () => {
    const g = mapSummary(load("nfl-summary-live.json"), "nfl", live.id, NOW);
    expect(g.state).toBe("in");
    expect(g.statusName).toBe("STATUS_IN_PROGRESS");
    expect(g.period).toBe(1);
    expect(g.statusText).toMatch(/^Q1 · \d+:\d{2}$/);
    expect(g.history.length).toBeGreaterThan(3);
    expect(g.history.every((p) => p.period === 1)).toBe(true);
    expect(g.winProbability?.source).toBe("espn_model");
    expect(g.winProbability!.home).toBe(g.history.at(-1)!.homeWin);
    expect(g.market?.provider).toBe("DraftKings");
    expect(g.lastPlay).toBeTruthy();
  });

  it("agrees with itself: scoreboard and summary give the same current probability", () => {
    const g = mapSummary(load("nfl-summary-live.json"), "nfl", live.id, NOW);
    expect(live.winProbability!.home).toBeCloseTo(g.winProbability!.home, 2);
  });
});
