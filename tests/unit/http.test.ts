import { describe, expect, it } from "vitest";
import { cacheHeaders, isLeague } from "@/lib/http";

describe("cacheHeaders (N2)", () => {
  it("lets shared caches hold a response for the remaining server TTL", () => {
    expect(cacheHeaders(15_000, false)).toEqual({
      "Cache-Control": "public, max-age=0, s-maxage=15",
    });
    expect(cacheHeaders(5_400, false)).toEqual({ "Cache-Control": "public, max-age=0, s-maxage=5" });
  });

  it("never promises more freshness than remains (rounds down)", () => {
    expect(cacheHeaders(999, false)).toEqual({ "Cache-Control": "no-store" });
  });

  it("does not let shared caches keep stale fallbacks", () => {
    expect(cacheHeaders(15_000, true)).toEqual({ "Cache-Control": "no-store" });
  });

  it("never uses stale-while-revalidate, which would break the 15s latency goal (N1)", () => {
    expect(JSON.stringify(cacheHeaders(60_000, false))).not.toContain("stale-while-revalidate");
  });
});

describe("isLeague", () => {
  it("accepts only supported leagues", () => {
    expect(isLeague("nfl")).toBe(true);
    expect(isLeague("ncaaf")).toBe(true);
    expect(isLeague("mlb")).toBe(false);
    expect(isLeague("")).toBe(false);
  });
});
