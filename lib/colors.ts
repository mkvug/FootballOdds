// Team colour handling (spec G9): clash detection and readable text.

export const SURFACE = "#0b0d10";

export function normalizeHex(raw: string | undefined | null, fallback = "#7a828e"): string {
  if (!raw) return fallback;
  const h = raw.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(h)) return `#${h.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(h)) {
    return `#${h.split("").map((c) => c + c).join("").toLowerCase()}`;
  }
  return fallback;
}

function toRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on `bg` (WCAG contrast). */
export function readableText(bg: string): "#ffffff" | "#0b0d10" {
  return contrast(bg, "#ffffff") >= contrast(bg, "#0b0d10") ? "#ffffff" : "#0b0d10";
}

function toLab(hex: string): [number, number, number] {
  const [r, g, b] = toRgb(hex).map(lin);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference. Below ~20 two colours are hard to tell apart. */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

export const CLASH_DELTA_E = 35;
/** Fills dimmer than this against the dark surface get swapped for the alternate colour. */
const MIN_SURFACE_CONTRAST = 2.2;

function mix(hex: string, toward: [number, number, number], t: number): string {
  const [r, g, b] = toRgb(hex).map((c, i) => Math.round(c + (toward[i] - c) * t));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Mixes toward white just far enough to read on the dark surface; keeps the hue recognisable. */
export function lighten(hex: string, minContrast = MIN_SURFACE_CONTRAST + 0.8): string {
  let out = normalizeHex(hex);
  for (let t = 0.05; t <= 1 && contrast(out, SURFACE) < minContrast; t += 0.05) {
    out = mix(normalizeHex(hex), [255, 255, 255], t);
  }
  return out;
}

interface Palette {
  color: string;
  altColor: string;
}

/**
 * Picks the fill colour for each side of the bar.
 * 1. A colour nearly invisible on the dark surface falls back to its alternate.
 * 2. If the two sides still clash (spec G9), the away side tries, in order: its own colour,
 *    a lightened copy of it, its alternate, a lightened alternate, then neutral light grey.
 *    The first visible candidate that is distinct from the home colour wins.
 */
export function resolveColors(home: Palette, away: Palette): { home: string; away: string } {
  const visible = (p: Palette) => {
    const base = normalizeHex(p.color);
    const alt = normalizeHex(p.altColor);
    if (contrast(base, SURFACE) >= MIN_SURFACE_CONTRAST) return base;
    return contrast(alt, SURFACE) > contrast(base, SURFACE) ? alt : base;
  };
  const h = visible(home);
  let a = visible(away);
  if (deltaE(h, a) < CLASH_DELTA_E) {
    const candidates = [away.color, away.altColor]
      .flatMap((c) => [normalizeHex(c), lighten(c)])
      .concat("#e8ecf0")
      .filter((c) => contrast(c, SURFACE) >= MIN_SURFACE_CONTRAST);
    a =
      candidates.find((c) => deltaE(h, c) >= CLASH_DELTA_E) ??
      candidates.sort((x, y) => deltaE(h, y) - deltaE(h, x))[0] ??
      a;
  }
  return { home: h, away: a };
}
