import { formatAmerican } from "@/lib/odds";
import { formatPct } from "@/lib/format";
import type { GameDetail } from "@/lib/providers/types";

/** Bookmaker moneyline and its de-vigged probability (spec G5). Hidden without odds. */
export function MarketStrip({ game }: { game: GameDetail }) {
  const m = game.market;
  if (!m) return null;
  return (
    <p className="tabular-nums">
      <span className="text-muted">Market ({m.provider}): </span>
      {game.away.abbreviation} {formatAmerican(m.awayAmerican)} · {game.home.abbreviation}{" "}
      {formatAmerican(m.homeAmerican)}
      <span className="text-muted">
        {" "}
        → {formatPct(m.implied.away)} / {formatPct(m.implied.home)}
      </span>
    </p>
  );
}
