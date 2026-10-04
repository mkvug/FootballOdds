import { describe, expect, it } from "vitest";
import {
  contrast,
  lighten,
  deltaE,
  normalizeHex,
  readableText,
  resolveColors,
  SURFACE,
} from "@/lib/colors";

describe("colors", () => {
  it("normalises ESPN hex values", () => {
    expect(normalizeHex("5A1414")).toBe("#5a1414");
    expect(normalizeHex("#fff")).toBe("#ffffff");
    expect(normalizeHex(undefined)).toBe("#7a828e");
    expect(normalizeHex("nonsense")).toBe("#7a828e");
  });

  it("computes contrast and picks readable text", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(readableText("#ffb612")).toBe("#0b0d10");
    expect(readableText("#002244")).toBe("#ffffff");
  });

  it("measures colour difference", () => {
    expect(deltaE("#ff0000", "#ff0000")).toBe(0);
    expect(deltaE("#ff0000", "#00ff00")).toBeGreaterThan(80);
    expect(deltaE("#c8102e", "#cc1f33")).toBeLessThan(20);
  });

  it("swaps a near-invisible colour for its alternate", () => {
    const out = resolveColors(
      { color: "#0b0d10", altColor: "#ffb612" },
      { color: "#00338d", altColor: "#c60c30" },
    );
    expect(out.home).toBe("#ffb612");
    expect(contrast(out.home, SURFACE)).toBeGreaterThan(2.2);
  });

  it("uses the away alternate when the two sides clash", () => {
    const out = resolveColors(
      { color: "#c8102e", altColor: "#ffffff" },
      { color: "#cc1f33", altColor: "#ffd100" },
    );
    expect(out.home).toBe("#c8102e");
    expect(out.away).toBe("#ffd100");
  });

  it("leaves distinct colours alone", () => {
    const out = resolveColors(
      { color: "#e31837", altColor: "#ffb612" },
      { color: "#0080c6", altColor: "#ffc20e" },
    );
    expect(out).toEqual({ home: "#e31837", away: "#0080c6" });
  });

  it("keeps both sides visible and distinct when dark primaries fall back to the same red (Patriots at Bills)", () => {
    const out = resolveColors(
      { color: "#00338d", altColor: "#c60c30" }, // Bills
      { color: "#002244", altColor: "#c60c30" }, // Patriots
    );
    expect(deltaE(out.home, out.away)).toBeGreaterThanOrEqual(20);
    expect(contrast(out.home, SURFACE)).toBeGreaterThanOrEqual(2.2);
    expect(contrast(out.away, SURFACE)).toBeGreaterThanOrEqual(2.2);
  });

  it("lightens a dark colour just enough to read, keeping its hue", () => {
    const out = lighten("#002244");
    expect(contrast(out, SURFACE)).toBeGreaterThanOrEqual(3);
    expect(out).not.toBe("#ffffff");
    expect(lighten("#ffb612")).toBe("#ffb612"); // already readable: untouched
  });

  it("always returns a visible colour for the away side, even for identical palettes", () => {
    const same = { color: "#c60c30", altColor: "#c60c30" };
    const out = resolveColors(same, same);
    expect(contrast(out.away, SURFACE)).toBeGreaterThanOrEqual(2.2);
    expect(deltaE(out.home, out.away)).toBeGreaterThanOrEqual(20);
  });

  it("separates near-identical reds that pass a looser threshold (Patriots at Bills, real ESPN values)", () => {
    const bills = { color: "#00338d", altColor: "#d50a0a" };
    const patriots = { color: "#002a5c", altColor: "#c60c30" };
    // The two alternates alone are only ~22 apart: distinct on paper, indistinguishable on a thin bar.
    expect(deltaE("#d50a0a", "#c60c30")).toBeLessThan(35);
    const out = resolveColors(bills, patriots);
    expect(out.home).toBe("#d50a0a");
    expect(out.away).not.toBe("#c60c30");
    expect(deltaE(out.home, out.away)).toBeGreaterThanOrEqual(35);
    expect(contrast(out.away, SURFACE)).toBeGreaterThanOrEqual(2.2);
  });
});
