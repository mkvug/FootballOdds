import { describe, expect, it } from "vitest";
import { americanToProb, devig, formatAmerican, parseAmerican } from "@/lib/odds";

describe("odds", () => {
  it("parses American odds in the shapes ESPN sends", () => {
    expect(parseAmerican("+170")).toBe(170);
    expect(parseAmerican("-320")).toBe(-320);
    expect(parseAmerican(-148)).toBe(-148);
    expect(parseAmerican("EVEN")).toBe(100);
    expect(parseAmerican("")).toBeNull();
    expect(parseAmerican(undefined)).toBeNull();
    expect(parseAmerican(0)).toBeNull();
  });

  it("converts to raw implied probability", () => {
    expect(americanToProb(-320)).toBeCloseTo(0.7619, 4);
    expect(americanToProb(250)).toBeCloseTo(0.2857, 4);
    expect(americanToProb(100)).toBe(0.5);
  });

  it("removes the vig (spec §6 worked example)", () => {
    const [fav, dog] = devig(-320, 250);
    expect(fav).toBeCloseTo(0.727, 3);
    expect(dog).toBeCloseTo(0.273, 3);
  });

  it("handles even odds, heavy favourites and already-fair markets", () => {
    expect(devig(100, 100)).toEqual([0.5, 0.5]);
    const [a, b] = devig(-1000, 650);
    expect(a + b).toBeCloseTo(1, 10);
    expect(a).toBeGreaterThan(0.85);
    const [x, y] = devig(-200, 200);
    expect(x).toBeCloseTo(0.6667, 3);
    expect(y).toBeCloseTo(0.3333, 3);
  });

  it("formats with an explicit plus sign", () => {
    expect(formatAmerican(170)).toBe("+170");
    expect(formatAmerican(-320)).toBe("-320");
  });
});
