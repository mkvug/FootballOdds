import Link from "next/link";
import { formatKickoff } from "@/lib/format";
import type { GameSummary } from "@/lib/providers/types";
import { MiniBar } from "./MiniBar";
import { TeamLogo } from "./TeamLogo";

function Row({ game, side }: { game: GameSummary; side: "home" | "away" }) {
  const team = game[side];
  const other = game[side === "home" ? "away" : "home"];
  const showScore = game.state !== "pre";
  // Dim only the large elements for the loser so the muted nickname keeps AA contrast.
  const dim = game.state === "post" && team.score < other.score ? "opacity-60" : "";
  return (
    <div className="flex items-center gap-3">
      <span className={`shrink-0 ${dim}`}>
        <TeamLogo team={team} size={36} />
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className={`font-display text-xl font-semibold uppercase tracking-wide ${dim}`}>
          {team.abbreviation}
        </span>
        <span className="ml-2 hidden text-sm font-medium text-muted sm:inline">{team.nickname}</span>
      </span>
      {showScore && (
        <span className={`font-display text-3xl font-bold tabular-nums leading-none ${dim}`}>
          {team.score}
        </span>
      )}
    </div>
  );
}

export function GameCard({ game }: { game: GameSummary }) {
  const live = game.state === "in";
  return (
    <Link
      href={`/game/${game.league}/${game.id}`}
      className="card-cv block rounded-2xl border border-line bg-surface p-4 transition-transform hover:-translate-y-0.5 hover:border-muted focus-visible:-translate-y-0.5"
      aria-label={`${game.away.name} at ${game.home.name}, ${game.statusText}`}
    >
      <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
        {live ? (
          <span className="flex items-center gap-1.5 text-live">
            <span className="live-dot inline-block size-2 rounded-full bg-live" aria-hidden />
            Live
          </span>
        ) : game.state === "post" ? (
          <span className="text-muted">Final</span>
        ) : (
          <span className="text-muted">Upcoming</span>
        )}
        <span className="tabular-nums text-muted" suppressHydrationWarning>
          {game.state === "pre" ? formatKickoff(game.startTime) : game.statusText}
        </span>
      </div>
      <div className="space-y-2">
        <Row game={game} side="away" />
        <Row game={game} side="home" />
      </div>
      {game.state !== "post" && (
        <div className="mt-4">
          <MiniBar game={game} />
        </div>
      )}
    </Link>
  );
}
