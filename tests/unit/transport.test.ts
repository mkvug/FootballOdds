import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache";
import { fetchGame, fetchGames, HttpError, resetTransport } from "@/lib/transport";

const board = readFileSync(path.join(__dirname, "../fixtures/nfl-scoreboard.json"), "utf8");
const json = (body: string, status = 200) => new Response(body, { status });

function stubFetch(server: () => Response) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("/api/")) return server();
      if (url.includes("/scoreboard")) return json(board);
      return json("{}", 404);
    }),
  );
  return calls;
}

beforeEach(() => {
  clearCache();
  resetTransport();
});
afterEach(() => vi.unstubAllGlobals());

describe("transport", () => {
  it("uses our server when it works and never calls ESPN", async () => {
    const calls = stubFetch(() => json('{"games":[],"stale":false,"failed":[],"fetchedAt":"x"}'));
    const out = await fetchGames();
    expect(out.games).toEqual([]);
    expect(calls).toEqual(["/api/games"]);
  });

  it("falls back to ESPN when the server answers 502, then stops asking the server", async () => {
    const calls = stubFetch(() => json("{}", 502));
    const first = await fetchGames();
    expect(first.games.length).toBeGreaterThan(10);
    expect(first.failed).toEqual([]);
    expect(calls.filter((c) => c === "/api/games")).toHaveLength(1);
    expect(calls.some((c) => c.includes("espn.com"))).toBe(true);

    clearCache();
    await fetchGames();
    expect(calls.filter((c) => c === "/api/games")).toHaveLength(1);
  });

  it("goes back to the server after the re-probe interval", async () => {
    vi.useFakeTimers();
    try {
      let serverUp = false;
      const calls = stubFetch(() =>
        serverUp ? json('{"games":[],"stale":false,"failed":[],"fetchedAt":"x"}') : json("{}", 502),
      );
      await fetchGames();
      serverUp = true;
      vi.advanceTimersByTime(5 * 60_000 + 1000);
      clearCache();
      const out = await fetchGames();
      expect(out.games).toEqual([]);
      expect(calls.filter((c) => c === "/api/games")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not treat a server 404 as an outage", async () => {
    const calls = stubFetch(() => json("{}", 404));
    await expect(fetchGame("nfl", "1", -1)).rejects.toMatchObject({ status: 404 });
    await expect(fetchGame("nfl", "1", -1)).rejects.toBeInstanceOf(HttpError);
    expect(calls.every((c) => c.startsWith("/api/"))).toBe(true);
  });

  it("surfaces an error when ESPN is unreachable from the browser too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input).startsWith("/api/") ? json("{}", 502) : json("{}", 403),
      ),
    );
    await expect(fetchGames()).rejects.toThrow();
  });
});
