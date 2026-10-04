import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameView } from "@/components/GameView";
import { getGame } from "@/lib/games";
import { isLeague } from "@/lib/http";
import { NotFoundError, type GameDetail } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

async function load(league: string, eventId: string): Promise<GameDetail | undefined> {
  if (!isLeague(league)) notFound();
  try {
    return (await getGame(league, eventId)).value;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    // ESPN is down: render the shell and let the client retry.
    console.error(`[game page] ${league}/${eventId} failed:`, err);
    return undefined;
  }
}

export async function generateMetadata(props: PageProps<"/game/[league]/[eventId]">): Promise<Metadata> {
  const { league, eventId } = await props.params;
  const game = await load(league, eventId);
  if (!game) return { title: "Game" };
  const title = `${game.away.abbreviation} @ ${game.home.abbreviation}`;
  const p = game.winProbability;
  const description = p
    ? `${game.away.name} ${Math.round(p.away * 100)}% – ${game.home.name} ${Math.round(p.home * 100)}% to win.`
    : `${game.away.name} at ${game.home.name}.`;
  return { title, description, openGraph: { title: `${title} · FootballOdds`, description } };
}

export default async function GamePage(props: PageProps<"/game/[league]/[eventId]">) {
  const { league, eventId } = await props.params;
  const initial = await load(league, eventId);
  return <GameView league={league as "nfl" | "ncaaf"} eventId={eventId} initial={initial} />;
}
