// Saves the current ESPN scoreboards, plus the summary of every game that is live (or the
// first few otherwise), into tests/fixtures/recorded/. Run during a live slate to capture
// `in`-state payloads (spec §10, Phase 0):  npm run record-fixtures

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/football";
const LEAGUES = { nfl: "nfl", ncaaf: "college-football" } as const;
const OUT = path.join(import.meta.dirname, "../tests/fixtures/recorded");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

async function get(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "FootballOdds/1.0 (fixture recorder)" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function save(name: string, data: unknown) {
  await writeFile(path.join(OUT, `${stamp}-${name}.json`), JSON.stringify(data, null, 2));
  console.log("saved", name);
}

await mkdir(OUT, { recursive: true });

for (const [league, slug] of Object.entries(LEAGUES)) {
  const qs = league === "ncaaf" ? "?groups=80&limit=300" : "?limit=100";
  const board = await get(`${BASE}/${slug}/scoreboard${qs}`);
  await save(`${league}-scoreboard`, board);

  const events: { id: string; status: { type: { state: string } } }[] = board.events ?? [];
  const live = events.filter((e) => e.status.type.state === "in");
  const picks = (live.length ? live : events).slice(0, 3);
  console.log(`${league}: ${live.length} live, recording ${picks.length} summaries`);
  for (const e of picks) {
    await save(`${league}-summary-${e.status.type.state}-${e.id}`, await get(`${BASE}/${slug}/summary?event=${e.id}`));
  }
}
