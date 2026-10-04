import { TIE_DISPLAY_THRESHOLD } from "@/lib/config";
import { readableText } from "@/lib/colors";
import { formatPct } from "@/lib/format";
import type { GameDetail } from "@/lib/providers/types";
import { AnimatedNumber } from "./AnimatedNumber";
import { BarDivider } from "./BarDivider";

interface Props {
  game: GameDetail;
  homeColor: string;
  awayColor: string;
}

/** Hero split bar plus the large percentages (spec G1, G2). Away left, home right. */
export function ProbabilityBar({ game, homeColor, awayColor }: Props) {
  const p = game.winProbability;
  const away = p?.away ?? 0.5;
  const home = p?.home ?? 0.5;
  const tie = p && p.tie >= TIE_DISPLAY_THRESHOLD ? p.tie : 0;
  const known = p !== null;
  const awayLeads = away > home;
  const homeLeads = home > away;

  return (
    <div>
      <div
        className="relative flex h-[clamp(28px,6vh,64px)] overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={
          known
            ? `${game.away.name} ${formatPct(away, 1)}, ${game.home.name} ${formatPct(home, 1)}`
            : "Win probability unavailable"
        }
      >
        <div
          className="bar-seg"
          style={{ width: `${(known ? away : 0.5) * 100}%`, background: known ? awayColor : "var(--line)" }}
        />
        {tie > 0 && (
          <div className="bar-seg" style={{ width: `${tie * 100}%`, background: "var(--muted)" }} />
        )}
        <div
          className="bar-seg"
          style={{ width: `${(known ? home : 0.5) * 100}%`, background: known ? homeColor : "var(--surface-2)" }}
        />
        {known && <BarDivider at={away} tone="bg" width={5} />}
        {known && tie > 0 && <BarDivider at={away + tie} tone="bg" width={5} />}
      </div>

      <div className="mt-3 flex items-end justify-between gap-4">
        <Side
          label={game.away.abbreviation}
          value={known ? away * 100 : null}
          color={awayColor}
          dim={known && !awayLeads}
        />
        {tie > 0 && (
          <span className="pb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            Tie {formatPct(tie, 1)}
          </span>
        )}
        <Side
          label={game.home.abbreviation}
          value={known ? home * 100 : null}
          color={homeColor}
          dim={known && !homeLeads}
          alignRight
        />
      </div>
      {!known && <p className="mt-1 text-center text-muted">Probability unavailable</p>}
    </div>
  );
}

function Side({
  label,
  value,
  color,
  dim,
  alignRight = false,
}: {
  label: string;
  value: number | null;
  color: string;
  dim: boolean;
  alignRight?: boolean;
}) {
  return (
    <div className={`${alignRight ? "text-right" : "text-left"} ${dim ? "opacity-60" : ""} transition-opacity`}>
      <div className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-widest text-muted"
        style={{ justifyContent: alignRight ? "flex-end" : "flex-start" }}>
        <span className="inline-block size-3 rounded-full" style={{ background: color, outline: `1px solid ${readableText(color)}33` }} aria-hidden />
        {label}
      </div>
      <div className="font-display text-[12vw] font-extrabold leading-[0.9] tabular-nums md:text-[8vw]">
        {value === null ? "–" : <><AnimatedNumber value={value} />%</>}
      </div>
    </div>
  );
}
