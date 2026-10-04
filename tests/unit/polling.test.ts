import { describe, expect, it } from "vitest";
import { gameInterval, withBackoff } from "@/lib/polling";

const NOW = Date.parse("2026-10-04T17:00:00Z");
const game = (state: "pre" | "in" | "post", startMin = 0, statusName = "") => ({
  state,
  statusName,
  startTime: new Date(NOW + startMin * 60_000).toISOString(),
});

describe("withBackoff", () => {
  it("leaves the first two failures alone, then doubles up to the cap", () => {
    expect([0, 1, 2].map((f) => withBackoff(5000, f))).toEqual([5000, 5000, 5000]);
    expect(withBackoff(5000, 3)).toBe(10_000);
    expect(withBackoff(5000, 4)).toBe(20_000);
    expect(withBackoff(5000, 5)).toBe(40_000);
    expect(withBackoff(5000, 9)).toBe(60_000);
  });
});

describe("gameInterval (spec §7)", () => {
  it("polls live games every 5s", () => {
    expect(gameInterval(game("in"), 0, NOW)).toBe(5000);
  });
  it("stops after the game is final", () => {
    expect(gameInterval(game("post"), 0, NOW)).toBe(false);
  });
  it("polls pre-game slowly, then fast near kickoff", () => {
    expect(gameInterval(game("pre", 120), 0, NOW)).toBe(60_000);
    expect(gameInterval(game("pre", 4), 0, NOW)).toBe(5000);
    expect(gameInterval(game("pre", -3), 0, NOW)).toBe(5000);
  });
  it("drops to 5 minutes for postponed games", () => {
    expect(gameInterval(game("pre", 10, "STATUS_POSTPONED"), 0, NOW)).toBe(300_000);
  });
  it("backs off after repeated failures", () => {
    expect(gameInterval(game("in"), 4, NOW)).toBe(20_000);
  });
});
