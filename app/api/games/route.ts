import { NextResponse, type NextRequest } from "next/server";
import { listGames } from "@/lib/games";
import { cacheHeaders, describeFailure, isLeague } from "@/lib/http";
import { LEAGUES } from "@/lib/config";
import type { GameSummary, League } from "@/lib/providers/types";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("league");
  const leagues: League[] = raw ? raw.split(",").filter(isLeague) : [...LEAGUES];
  if (leagues.length === 0) {
    return NextResponse.json({ error: "Unknown league" }, { status: 400 });
  }

  const results = await Promise.allSettled(leagues.map((l) => listGames(l)));

  const games: GameSummary[] = [];
  const failed: League[] = [];
  const details: { league: League; reason: string }[] = [];
  let stale = false;
  let ttlMs = Infinity;
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const reason = describeFailure(r.reason);
      console.error(`[api/games] ${leagues[i]} failed: ${reason}`, r.reason);
      failed.push(leagues[i]);
      details.push({ league: leagues[i], reason });
      return;
    }
    games.push(...r.value.value);
    stale ||= r.value.stale;
    ttlMs = Math.min(ttlMs, r.value.ttlMs);
  });

  if (failed.length === leagues.length) {
    return NextResponse.json({ error: "Upstream unavailable", details }, { status: 502 });
  }

  return NextResponse.json(
    { games, stale: stale || failed.length > 0, failed, fetchedAt: new Date().toISOString() },
    { headers: cacheHeaders(ttlMs, stale || failed.length > 0) },
  );
}
