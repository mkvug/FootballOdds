"use client";

import { useMemo, useState } from "react";
import { useGames, useNow } from "@/lib/hooks";
import { formatAgo, formatKickoff } from "@/lib/format";
import type { GameSummary, League } from "@/lib/providers/types";
import { GameCard } from "./GameCard";

type Filter = "all" | League;

const LEAGUE_LABEL: Record<League, string> = { nfl: "NFL", ncaaf: "College" };
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "nfl", label: "NFL" },
  { id: "ncaaf", label: "College" },
];

const byStart = (a: GameSummary, b: GameSummary) =>
  a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id);

function matches(g: GameSummary, q: string) {
  if (!q) return true;
  const hay = `${g.home.name} ${g.away.name} ${g.home.abbreviation} ${g.away.abbreviation}`.toLowerCase();
  return hay.includes(q);
}

function Grid({ games }: { games: GameSummary[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {games.map((g) => (
        <li key={`${g.league}:${g.id}`}>
          <GameCard game={g} />
        </li>
      ))}
    </ul>
  );
}

function Collapsible({
  title,
  games,
  open,
}: {
  title: string;
  games: GameSummary[];
  open: boolean;
}) {
  if (games.length === 0) return null;
  // Re-key when `open` flips so the default applies again (e.g. live games end).
  return (
    <details key={String(open)} open={open} className="group mt-10">
      <summary className="mb-4 flex cursor-pointer list-none items-center gap-2 font-display text-2xl font-bold uppercase tracking-wide">
        <span className="inline-block text-muted transition-transform group-open:rotate-90" aria-hidden>
          ▸
        </span>
        {title}
        <span className="text-base font-medium text-muted">{games.length}</span>
      </summary>
      <Grid games={games} />
    </details>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy aria-label="Loading games">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-44 animate-pulse rounded-2xl border border-line bg-surface" />
      ))}
    </div>
  );
}

export function GameList() {
  const { data, error, isPending, dataUpdatedAt, refetch } = useGames();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const { live, upcoming, final, nextKickoff } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = (data?.games ?? []).filter(
      (g) => (filter === "all" || g.league === filter) && matches(g, q),
    );
    const upcoming = all.filter((g) => g.state === "pre").sort(byStart);
    return {
      live: all.filter((g) => g.state === "in").sort(byStart),
      upcoming,
      final: all.filter((g) => g.state === "post").sort((a, b) => byStart(b, a)),
      nextKickoff: upcoming[0],
    };
  }, [data, filter, query]);

  const liveByLeague = (["nfl", "ncaaf"] as League[])
    .map((league) => ({ league, games: live.filter((g) => g.league === league) }))
    .filter((s) => s.games.length > 0);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="League" className="flex gap-1 rounded-full bg-surface-2 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                filter === f.id ? "bg-ink text-bg" : "text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search teams"
          aria-label="Search teams"
          className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2 text-sm placeholder:text-muted sm:max-w-xs sm:flex-none"
        />
        <span className="ml-auto text-xs tabular-nums text-muted" aria-live="off">
          {data && now ? `Updated ${formatAgo(now - dataUpdatedAt)} ago` : ""}
        </span>
      </div>

      {data?.stale && (
        <p role="status" className="mb-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          {data.failed.length > 0
            ? `${data.failed.map((l) => LEAGUE_LABEL[l]).join(" and ")} games are temporarily unavailable.`
            : "Showing the last known data while ESPN catches up."}
        </p>
      )}

      {isPending && <Skeleton />}

      {error && !data && (
        <div role="alert" className="rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="font-display text-2xl font-bold uppercase">Can&apos;t reach the scoreboard</p>
          <p className="mt-2 text-sm text-muted">We&apos;ll keep trying automatically.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-bg"
          >
            Try now
          </button>
        </div>
      )}

      {data && (
        <>
          {liveByLeague.map(({ league, games }) => (
            <section key={league} className="mb-8" aria-labelledby={`live-${league}`}>
              <h2
                id={`live-${league}`}
                className="mb-4 flex items-center gap-2 font-display text-2xl font-bold uppercase tracking-wide"
              >
                <span className="live-dot inline-block size-2.5 rounded-full bg-live" aria-hidden />
                {LEAGUE_LABEL[league]} live
                <span className="text-base font-medium text-muted">{games.length}</span>
              </h2>
              <Grid games={games} />
            </section>
          ))}

          {live.length === 0 && (
            <div className="rounded-2xl border border-line bg-surface p-8 text-center">
              <p className="font-display text-3xl font-bold uppercase">No games live right now</p>
              <p className="mt-2 text-muted" suppressHydrationWarning>
                {query
                  ? "Nothing matches your search."
                  : nextKickoff
                    ? `Next kickoff: ${nextKickoff.away.name} at ${nextKickoff.home.name}, ${formatKickoff(nextKickoff.startTime)}.`
                    : "Check back when the next slate starts."}
              </p>
            </div>
          )}

          <Collapsible title="Upcoming" games={upcoming} open={live.length === 0} />
          <Collapsible title="Final" games={final} open={false} />
        </>
      )}
    </div>
  );
}
