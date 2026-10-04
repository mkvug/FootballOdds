import { expect, test } from "@playwright/test";
import { GAMES, resetMock } from "./helpers";

test.beforeEach(resetMock);

test.describe("/api/games", () => {
  test("lists both leagues with normalised games", async ({ request }) => {
    const res = await request.get("/api/games");
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.stale).toBe(false);
    expect(body.failed).toEqual([]);
    const leagues = new Set(body.games.map((g: { league: string }) => g.league));
    expect(leagues).toEqual(new Set(["nfl", "ncaaf"]));

    const live = body.games.find((g: { id: string }) => g.id === GAMES.liveNfl.id);
    expect(live).toMatchObject({
      state: "in",
      statusText: "Q3 · 4:12",
      home: { abbreviation: "LV", score: 17 },
      away: { abbreviation: "KC", score: 24 },
    });
    expect(live.winProbability.home).toBeCloseTo(0.62, 5);
    expect(live.winProbability.source).toBe("espn_model");
  });

  test("filters by league and rejects unknown ones", async ({ request }) => {
    const nfl = await (await request.get("/api/games?league=nfl")).json();
    expect(nfl.games.every((g: { league: string }) => g.league === "nfl")).toBe(true);
    expect((await request.get("/api/games?league=mlb")).status()).toBe(400);
  });
});

test.describe("/api/games/[league]/[eventId]", () => {
  const base = `/api/games/nfl/${GAMES.liveNfl.id}`;

  test("returns detail with full history", async ({ request }) => {
    const body = await (await request.get(base)).json();
    expect(body.history).toHaveLength(120);
    expect(body.history.at(-1)).toMatchObject({ seq: 119, homeWin: 0.62 });
    expect(body.market).toMatchObject({ provider: "DraftKings", homeAmerican: 175, awayAmerican: -210 });
    expect(body.lastPlay).toBe("P.Mahomes pass complete to T.Kelce for 12 yds");
  });

  test("returns only newer points when given ?since=", async ({ request }) => {
    const body = await (await request.get(`${base}?since=117`)).json();
    expect(body.history.map((p: { seq: number }) => p.seq)).toEqual([118, 119]);
    const none = await (await request.get(`${base}?since=119`)).json();
    expect(none.history).toEqual([]);
    expect(none.winProbability.home).toBeCloseTo(0.62, 5);
  });

  test("404s unknown games and leagues", async ({ request }) => {
    expect((await request.get("/api/games/nfl/12345")).status()).toBe(404);
    expect((await request.get("/api/games/mlb/1")).status()).toBe(404);
    expect((await request.get("/api/games/nfl/abc")).status()).toBe(404);
  });
});
