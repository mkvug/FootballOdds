import { NextResponse, type NextRequest } from "next/server";
import { getGame } from "@/lib/games";
import { cacheHeaders, isLeague } from "@/lib/http";
import { NotFoundError } from "@/lib/providers/types";

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/games/[league]/[eventId]">,
) {
  const { league, eventId } = await ctx.params;
  if (!isLeague(league)) {
    return NextResponse.json({ error: "Unknown league" }, { status: 404 });
  }

  // Incremental history (spec §7): the client sends the last seq it holds.
  const sinceRaw = req.nextUrl.searchParams.get("since");
  const since = sinceRaw === null ? -1 : Number.parseInt(sinceRaw, 10);

  try {
    const { value, stale, ttlMs } = await getGame(league, eventId);
    const history = Number.isFinite(since)
      ? value.history.filter((p) => p.seq > since)
      : value.history;
    return NextResponse.json(
      { ...value, history, stale: stale || undefined },
      { headers: cacheHeaders(ttlMs, stale) },
    );
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    console.error(`[api/game] ${league}/${eventId} failed:`, err);
    return NextResponse.json({ error: "Upstream unavailable" }, { status: 502 });
  }
}
