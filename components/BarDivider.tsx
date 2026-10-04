/**
 * Vertical "|" gap where the two sides of a probability bar meet, so the boundary stays
 * visible even when both teams end up with similar colours. Sits inside the bar's
 * overflow-hidden track; `tone` must match what is behind the bar.
 */
export function BarDivider({
  at,
  tone,
  width = 3,
}: {
  /** Position along the bar, 0..1. */
  at: number;
  tone: "surface" | "bg";
  width?: number;
}) {
  // At the very ends there is only one side to show.
  if (at < 0.005 || at > 0.995) return null;
  return (
    <span
      aria-hidden
      data-testid="bar-divider"
      className="bar-div pointer-events-none absolute inset-y-0 z-10 -translate-x-1/2"
      style={{
        left: `${at * 100}%`,
        width,
        background: tone === "surface" ? "var(--surface)" : "var(--bg)",
      }}
    />
  );
}
