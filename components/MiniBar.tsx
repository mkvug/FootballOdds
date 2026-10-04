import { resolveColors } from "@/lib/colors";
import { formatPct } from "@/lib/format";
import { BarDivider } from "./BarDivider";
import type { GameSummary } from "@/lib/providers/types";

/** Thin win-probability bar for list cards (spec L2). Away on the left, home on the right. */
export function MiniBar({ game }: { game: GameSummary }) {
  const p = game.winProbability;
  if (!p) return <div className="h-2 rounded-full bg-surface-2" aria-hidden />;

  const colors = resolveColors(game.home, game.away);
  const homeLeads = p.home >= p.away;
  const lead = homeLeads ? game.home : game.away;
  const leadPct = homeLeads ? p.home : p.away;

  return (
    <div>
      <div
        className="relative flex h-2 overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={`${lead.name} ${formatPct(leadPct)} to win${p.source === "market_devig" ? " (betting market)" : ""}`}
      >
        <div className="bar-seg" style={{ width: `${p.away * 100}%`, background: colors.away }} />
        <div className="bar-seg" style={{ width: `${p.tie * 100}%`, background: "var(--muted)" }} />
        <div className="bar-seg" style={{ width: `${p.home * 100}%`, background: colors.home }} />
        <BarDivider at={p.away} tone="surface" width={3} />
        {p.tie > 0.01 && <BarDivider at={p.away + p.tie} tone="surface" width={3} />}
      </div>
      <div className="mt-1.5 flex justify-between text-xs tabular-nums text-muted">
        <span className={!homeLeads ? "font-semibold text-ink" : ""}>
          {game.away.abbreviation} {formatPct(p.away)}
        </span>
        <span className={homeLeads ? "font-semibold text-ink" : ""}>
          {formatPct(p.home)} {game.home.abbreviation}
        </span>
      </div>
    </div>
  );
}
