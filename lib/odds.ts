// American odds -> probabilities (spec §6).

/** Accepts 170, -320, "+170", "-320", "EVEN". Returns null if unparseable. */
export function parseAmerican(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw !== 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  if (s === "EVEN" || s === "EV" || s === "PK") return 100;
  const n = Number(s.replace("+", ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Raw implied probability, vig included. */
export function americanToProb(odds: number): number {
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

/** Proportional de-vig of a two-way market. Returns [home, away] summing to 1. */
export function devig(homeAmerican: number, awayAmerican: number): [number, number] {
  const h = americanToProb(homeAmerican);
  const a = americanToProb(awayAmerican);
  const total = h + a;
  return [h / total, a / total];
}

export function formatAmerican(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}
