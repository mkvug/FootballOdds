// Local stand-in for ESPN's site API, built from the recorded fixtures.
//   node tests/e2e/mock-espn.mjs            (port 4010)
// Scenarios are driven through POST /__control, see `apply()` below.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const PORT = Number(process.env.MOCK_ESPN_PORT ?? 4010);
const FIX = path.join(import.meta.dirname, "../fixtures");
const load = (f) => JSON.parse(readFileSync(path.join(FIX, f), "utf8"));
const clone = (o) => structuredClone(o);

const nflBoard = load("nfl-scoreboard.json");
const ncaafBoard = load("ncaaf-scoreboard.json");
const finalSummary = load("nfl-summary-post.json");

// Fixed cast so tests can assert on names.
const LIVE_NFL_ID = "401872976"; // KC (away) at LV (home)
const FINAL_NFL_ID = "401872964"; // PIT at CLE
const LIVE_NCAAF_ID = "401856705"; // VAN (away) at UGA (home)
const BASE_POINTS = 120;

let state;
function reset() {
  state = {
    mode: "normal", // normal | noLive | ncaafDown | summaryDown | allDown
    history: finalSummary.winprobability.slice(0, BASE_POINTS).map((p) => p.homeWinPercentage),
    ncaafHome: 0.35,
    requests: {},
  };
  state.history[BASE_POINTS - 1] = 0.62;
}
reset();

function apply(body) {
  if (body.reset) reset();
  if (body.mode) state.mode = body.mode;
  if (typeof body.append === "number") state.history.push(body.append);
  if (typeof body.ncaafHome === "number") state.ncaafHome = body.ncaafHome;
}

const now = () => Date.now();
const iso = (ms) => new Date(ms).toISOString().replace(/:\d\d\.\d+Z$/, "Z");

function inProgress(clock, period) {
  return {
    clock: 0,
    displayClock: clock,
    period,
    type: {
      id: "2",
      name: "STATUS_IN_PROGRESS",
      state: "in",
      completed: false,
      description: "In Progress",
      detail: `${clock} - ${period}rd Quarter`,
      shortDetail: `${clock} - ${period}rd`,
    },
  };
}

function setScore(event, away, home) {
  for (const c of event.competitions[0].competitors) {
    c.score = String(c.homeAway === "home" ? home : away);
  }
}

function nflScoreboard() {
  const board = clone(nflBoard);
  const t = now();
  board.events.forEach((e, i) => {
    if (e.status.type.state === "pre") e.date = iso(t + (2 + i * 0.2) * 3_600_000);
    else e.date = iso(t - 4 * 3_600_000);
    if (e.id === LIVE_NFL_ID && state.mode !== "noLive") {
      e.date = iso(t - 3_600_000);
      e.status = inProgress("4:12", 3);
      setScore(e, 24, 17);
      delete e.competitions[0].odds;
    }
  });
  return board;
}

function ncaafScoreboard() {
  if (state.mode === "ncaafDown" || state.mode === "allDown") return null;
  const board = clone(ncaafBoard);
  const t = now();
  board.events.forEach((e) => (e.date = iso(t - 20 * 3_600_000)));
  const e = board.events.find((x) => x.id === LIVE_NCAAF_ID);
  if (e && state.mode !== "noLive") {
    e.date = iso(t - 3_600_000);
    e.status = inProgress("9:41", 2);
    setScore(e, 10, 13);
    // The shape community docs describe; exercises the scoreboard-probability path.
    e.competitions[0].situation = {
      lastPlay: { probability: { homeWinPercentage: state.ncaafHome, tiePercentage: 0 } },
    };
  }
  return board;
}

const playIds = finalSummary.winprobability.map((p) => p.playId);

function summaryFor(id) {
  if (state.mode === "summaryDown" || state.mode === "allDown") return { status: 500 };
  if (id === FINAL_NFL_ID) return { body: clone(finalSummary) };

  const event = nflScoreboard().events.find((e) => e.id === id);
  if (!event) return { status: 404 };
  const comp = event.competitions[0];
  const live = event.status.type.state === "in";
  const body = {
    header: {
      id,
      competitions: [{ date: event.date, status: event.status, competitors: comp.competitors }],
    },
    winprobability: [],
    drives: { previous: [] },
    pickcenter: clone(finalSummary.pickcenter),
  };
  const odds = body.pickcenter[0];
  odds.awayTeamOdds.moneyLine = -210;
  odds.homeTeamOdds.moneyLine = 175;

  if (live) {
    body.winprobability = state.history.map((h, i) => ({
      homeWinPercentage: h,
      tiePercentage: 0,
      playId: playIds[i] ?? `mock-${i}`,
    }));
    body.drives = {
      previous: clone(finalSummary.drives.previous),
      current: {
        plays: [
          {
            id: "mock-current",
            text: "P.Mahomes pass complete to T.Kelce for 12 yds",
            period: { number: 3 },
            clock: { displayValue: "4:12" },
          },
        ],
      },
    };
  }
  return { body };
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const send = (status, data) => {
    // Real ESPN sends the same header; the browser fallback depends on it.
    res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(data));
  };
  state.requests[url.pathname] = (state.requests[url.pathname] ?? 0) + 1;

  if (url.pathname === "/__control") {
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        apply(raw ? JSON.parse(raw) : {});
        send(200, { ok: true, mode: state.mode, points: state.history.length });
      });
      return;
    }
    return send(200, { mode: state.mode, points: state.history.length, requests: state.requests });
  }

  if (state.mode === "allDown" && url.pathname.endsWith("/scoreboard")) return send(500, {});

  if (url.pathname === "/nfl/scoreboard") return send(200, nflScoreboard());
  if (url.pathname === "/college-football/scoreboard") {
    const board = ncaafScoreboard();
    return board ? send(200, board) : send(500, {});
  }
  if (url.pathname === "/nfl/summary") {
    const out = summaryFor(url.searchParams.get("event") ?? "");
    return out.body ? send(200, out.body) : send(out.status, {});
  }
  send(404, { error: "mock: not found" });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock ESPN on :${PORT}`));
