import { periodLabel } from "@/lib/format";
import type { GameDetail, ProbabilityPoint } from "@/lib/providers/types";

interface Props {
  game: GameDetail;
  homeColor: string;
  awayColor: string;
  swings: ProbabilityPoint[];
}

const W = 1000;
const H = 300;

/** Home win probability across the game, hand-rolled SVG (spec G3). */
export function ProbabilityChart({ game, homeColor, awayColor, swings }: Props) {
  const pts = game.history;
  if (pts.length < 2) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center rounded-2xl border border-dashed border-line text-muted">
        {game.state === "pre"
          ? "The win-probability timeline starts at kickoff."
          : "Waiting for the first plays…"}
      </div>
    );
  }

  const last = pts.length - 1;
  const x = (i: number) => (i / last) * W;
  const y = (p: number) => (1 - p) * H;
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.homeWin).toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H / 2} L0 ${H / 2} Z`;

  // Period spans -> boundary lines and labels.
  const spans: { period: number; from: number; to: number }[] = [];
  pts.forEach((p, i) => {
    if (p.period === undefined) return;
    const cur = spans.at(-1);
    if (cur && cur.period === p.period) cur.to = i;
    else spans.push({ period: p.period, from: i, to: i });
  });

  const seqIndex = new Map(pts.map((p, i) => [p.seq, i]));
  const end = pts[last];
  const summary = `Home win probability over the game. ${game.home.name} now ${(end.homeWin * 100).toFixed(0)} percent, ${game.away.name} ${((1 - end.homeWin - end.tie) * 100).toFixed(0)} percent.`;

  return (
    <div className="relative flex h-full min-h-40 flex-col">
      <div className="relative flex-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          role="img"
          aria-label={summary}
        >
          <defs>
            <clipPath id="clip-home"><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
            <clipPath id="clip-away"><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
          </defs>
          {[0.25, 0.75].map((g) => (
            <line key={g} x1="0" x2={W} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth="1" className="chart-line" />
          ))}
          <path d={area} fill={homeColor} fillOpacity="0.4" clipPath="url(#clip-home)" />
          <path d={area} fill={awayColor} fillOpacity="0.4" clipPath="url(#clip-away)" />
          {spans.slice(1).map((s) => (
            <line key={s.from} x1={x(s.from)} x2={x(s.from)} y1="0" y2={H} stroke="var(--line)" strokeWidth="1" className="chart-line" />
          ))}
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="6 6" className="chart-line" />
          <path d={line} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" className="chart-line" />
        </svg>

        {/* HTML markers so dots stay round while the SVG stretches. */}
        {swings.map((s) => {
          const i = seqIndex.get(s.seq);
          if (i === undefined) return null;
          return (
            <span
              key={s.seq}
              title={s.playText}
              className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-live"
              style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(s.homeWin) / H) * 100}%` }}
            />
          );
        })}
        <span
          className="live-dot absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-ink"
          style={{ left: "100%", top: `${(y(end.homeWin) / H) * 100}%` }}
          aria-hidden
        />

        <span className="absolute left-2 top-1 text-xs font-semibold uppercase tracking-wider text-muted">
          {game.home.abbreviation} 100%
        </span>
        <span className="absolute bottom-1 left-2 text-xs font-semibold uppercase tracking-wider text-muted">
          {game.away.abbreviation} 100%
        </span>
        <span className="absolute right-2 top-1/2 -translate-y-full pb-0.5 text-xs font-semibold text-muted">50%</span>
      </div>

      <div className="relative mt-1 h-5" aria-hidden>
        {spans.map((s) => (
          <span
            key={s.from}
            className="absolute -translate-x-1/2 text-xs font-semibold uppercase tracking-wider text-muted"
            style={{ left: `${(((x(s.from) + x(s.to)) / 2) / W) * 100}%` }}
          >
            {periodLabel(s.period)}
          </span>
        ))}
      </div>
    </div>
  );
}
