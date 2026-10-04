"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { POLL, SWING_THRESHOLD } from "@/lib/config";
import { resolveColors } from "@/lib/colors";
import { formatAgo, formatCountdown, formatKickoff, formatPct } from "@/lib/format";
import { useGame, useIdle, useNow, useThrottled } from "@/lib/hooks";
import { isSuspended } from "@/lib/polling";
import type { GameDetail, League, ProbabilityPoint } from "@/lib/providers/types";
import { Footer } from "./Footer";
import { FullscreenButton } from "./FullscreenButton";
import { MarketStrip } from "./MarketStrip";
import { ProbabilityBar } from "./ProbabilityBar";
import { ProbabilityChart } from "./ProbabilityChart";
import { TeamLogo } from "./TeamLogo";

interface Props {
  league: League;
  eventId: string;
  initial?: GameDetail;
}

export function GameView({ league, eventId, initial }: Props) {
  const { data, isError, dataUpdatedAt, refetch } = useGame(league, eventId, initial);

  if (!data) {
    return (
      <div className="theme-dark flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-ink">
        {isError ? (
          <>
            <p role="alert" className="font-display text-4xl font-bold uppercase">
              Can&apos;t load this game
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => refetch()} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-bg">
                Try again
              </button>
              <Link href="/" className="rounded-full border border-line px-5 py-2 text-sm font-semibold">
                All games
              </Link>
            </div>
          </>
        ) : (
          <p className="animate-pulse font-display text-3xl font-bold uppercase text-muted">Loading game…</p>
        )}
      </div>
    );
  }

  return <GameScreen game={data} updatedAt={dataUpdatedAt} fetchFailed={isError} />;
}

/** Plays that moved home win probability by at least the swing threshold. */
function findSwings(history: ProbabilityPoint[]): (ProbabilityPoint & { delta: number })[] {
  const out: (ProbabilityPoint & { delta: number })[] = [];
  for (let i = 1; i < history.length; i++) {
    const delta = history[i].homeWin - history[i - 1].homeWin;
    if (Math.abs(delta) >= SWING_THRESHOLD) out.push({ ...history[i], delta });
  }
  return out;
}

function GameScreen({
  game,
  updatedAt,
  fetchFailed,
}: {
  game: GameDetail;
  updatedAt: number;
  fetchFailed: boolean;
}) {
  const now = useNow();
  const idle = useIdle(5000);
  const colors = useMemo(() => resolveColors(game.home, game.away), [game.home, game.away]);
  const swings = useMemo(() => findSwings(game.history), [game.history]);

  // Only swings that happen while the page is open earn a toast.
  const [baselineSeq] = useState(() => game.history.at(-1)?.seq ?? -1);
  const newest = swings.at(-1);
  const toast = newest && newest.seq > baselineSeq ? newest : null;

  const p = game.winProbability;
  const leader = !p || p.home === p.away ? null : p.home > p.away ? game.home : game.away;

  // Browser tab title mirrors the score of the odds (spec G10).
  useEffect(() => {
    document.title = p
      ? `${game.away.abbreviation} ${formatPct(p.away)} – ${game.home.abbreviation} ${formatPct(p.home)} · FootballOdds`
      : `${game.away.abbreviation} @ ${game.home.abbreviation} · FootballOdds`;
  }, [game.away.abbreviation, game.home.abbreviation, p]);

  const announced = useThrottled(leader?.name ?? null, 30_000);

  const live = game.state === "in";
  const suspended = isSuspended(game);
  const ageMs = now === null ? 0 : now - updatedAt;
  const delayed = live && (fetchFailed || game.stale === true || ageMs > POLL.delayedAfterMs);

  const sourceLabel =
    p?.source === "espn_model"
      ? "ESPN win probability"
      : p?.source === "market_devig"
        ? `${game.market?.provider ?? "Market"} odds, vig removed`
        : "No probability source";

  return (
    <div
      data-idle={idle}
      className="theme-dark flex min-h-dvh flex-col bg-bg px-[max(1rem,3vw)] pb-4 text-ink min-[1600px]:data-[idle=true]:cursor-none"
    >
      <header
        data-idle={idle}
        className="flex items-center justify-between gap-3 py-4 transition-opacity duration-500 min-[1600px]:data-[idle=true]:opacity-0"
      >
        <Link href="/" className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink">
          ← Games
        </Link>
        <div className="flex items-center gap-3">
          <StateBadge game={game} suspended={suspended} />
          {delayed && (
            <span role="status" className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold uppercase tracking-wider text-black">
              Delayed
            </span>
          )}
          <FullscreenButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-[clamp(1rem,3vh,2.5rem)]">
        <section className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <TeamBlock game={game} side="away" />
          <Center game={game} now={now} suspended={suspended} />
          <TeamBlock game={game} side="home" />
        </section>

        <ProbabilityBar game={game} homeColor={colors.home} awayColor={colors.away} />

        <section aria-label="Win probability over the game" className="min-h-40 flex-1">
          <ProbabilityChart game={game} homeColor={colors.home} awayColor={colors.away} swings={swings} />
        </section>

        <div className="space-y-1 text-sm sm:text-base">
          <MarketStrip game={game} />
          {game.lastPlay && live && (
            <p className="truncate">
              <span className="text-muted">Last play: </span>
              {game.lastPlay}
            </p>
          )}
          <p className="text-muted tabular-nums">
            {game.state === "post" ? "Final · " : now ? `Updated ${formatAgo(ageMs)} ago · ` : ""}
            Source: {sourceLabel}
          </p>
        </div>
      </main>

      {toast && (
        <div
          key={toast.seq}
          role="status"
          className="swing-toast pointer-events-none fixed bottom-24 left-1/2 z-10 max-w-[90vw] -translate-x-1/2 rounded-2xl bg-live px-5 py-3 text-center text-white shadow-2xl"
        >
          <p className="font-display text-2xl font-extrabold uppercase tracking-wide">
            Big swing: {toast.delta > 0 ? game.home.abbreviation : game.away.abbreviation} +
            {Math.round(Math.abs(toast.delta) * 100)}%
          </p>
          {toast.playText && <p className="mt-0.5 line-clamp-2 text-sm opacity-90">{toast.playText}</p>}
        </div>
      )}

      {/* Announces only when the favourite changes, at most every 30s (spec N4). */}
      <div aria-live="polite" className="sr-only">
        {announced ? `${announced} now favored to win.` : ""}
      </div>

      <Footer className="px-0 pb-0 pt-3 text-left" />
    </div>
  );
}

function StateBadge({ game, suspended }: { game: GameDetail; suspended: boolean }) {
  if (suspended) {
    return <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold uppercase tracking-wider">{game.statusText || "Postponed"}</span>;
  }
  if (game.state === "in") {
    return (
      <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-live">
        <span className="live-dot inline-block size-2.5 rounded-full bg-live" aria-hidden />
        Live
      </span>
    );
  }
  return (
    <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold uppercase tracking-wider">
      {game.state === "post" ? "Final" : "Upcoming"}
    </span>
  );
}

function TeamBlock({ game, side }: { game: GameDetail; side: "home" | "away" }) {
  const team = game[side];
  const right = side === "home";
  const other = game[right ? "away" : "home"];
  // Dim the loser's large elements only; small muted text must keep AA contrast (N4).
  const dim = game.state === "post" && team.score < other.score ? "opacity-60" : "";
  return (
    <div className={`flex min-w-0 items-center gap-[clamp(0.5rem,2vw,1.5rem)] ${right ? "flex-row-reverse text-right" : ""}`}>
      <span className={`shrink-0 ${dim}`}>
        <TeamLogo team={team} size={96} dark priority />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-muted sm:text-sm">{team.location}</p>
        <p className={`truncate font-display text-[clamp(1.5rem,4.5vw,4rem)] font-extrabold uppercase leading-none ${dim}`}>{team.nickname}</p>
        {game.state !== "pre" && (
          <p className={`font-display text-[clamp(2.5rem,7vw,6rem)] font-bold leading-none tabular-nums ${dim}`}>{team.score}</p>
        )}
      </div>
    </div>
  );
}

function Center({ game, now, suspended }: { game: GameDetail; now: number | null; suspended: boolean }) {
  let top = game.statusText;
  let bottom: string | null = null;
  if (game.state === "pre" && !suspended) {
    const until = new Date(game.startTime).getTime() - (now ?? 0);
    top = now === null ? "" : until > 0 ? formatCountdown(until) : "Starting";
    bottom = until > 0 ? "to kickoff" : null;
  }
  return (
    <div className="text-center">
      <p className="font-display text-[clamp(1.25rem,3.5vw,3rem)] font-bold uppercase leading-none tabular-nums">{top}</p>
      {bottom && <p className="mt-1 text-xs uppercase tracking-widest text-muted">{bottom}</p>}
      {game.state === "pre" && (
        <p className="mt-1 text-xs text-muted" suppressHydrationWarning>
          {formatKickoff(game.startTime)}
        </p>
      )}
    </div>
  );
}
