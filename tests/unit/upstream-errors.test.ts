import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanUserAgent } from "@/lib/config";
import { describeFailure } from "@/lib/http";
import { espnProvider } from "@/lib/providers/espn";
import { NotFoundError } from "@/lib/providers/types";

const respond = (status: number) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));

afterEach(() => vi.unstubAllGlobals());

describe("upstream failures are not mistaken for missing games", () => {
  it.each([403, 429, 500, 503])("ESPN %i is an upstream error", async (status) => {
    respond(status);
    const err = await espnProvider.listGames("nfl").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(NotFoundError);
    expect(describeFailure(err)).toBe(`ESPN responded ${status}`);
  });

  it.each([400, 404])("ESPN %i on a game means no such game", async (status) => {
    respond(status);
    await expect(espnProvider.getGame("nfl", "123")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects non-numeric event ids without calling ESPN", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(espnProvider.getGame("nfl", "../x")).rejects.toBeInstanceOf(NotFoundError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("describeFailure", () => {
  it("includes the network cause code", () => {
    const err = new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } });
    expect(describeFailure(err)).toBe("fetch failed (ENOTFOUND)");
  });
  it("names timeouts plainly", () => {
    const err = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    expect(describeFailure(err)).toBe("timed out talking to ESPN");
  });
  it("copes with non-errors", () => {
    expect(describeFailure("boom")).toBe("unknown error");
  });
});

describe("cleanUserAgent", () => {
  it("strips characters that are illegal in a header value", () => {
    expect(cleanUserAgent("FootballOdds/1.0\n (me@example.com)\r")).toBe("FootballOdds/1.0 (me@example.com)");
    expect(cleanUserAgent("Football⚽Odds")).toBe("FootballOdds");
  });
  it("falls back to the default when unset or empty", () => {
    expect(cleanUserAgent(undefined)).toBe("FootballOdds/1.0 (personal project)");
    expect(cleanUserAgent("  \n ")).toBe("FootballOdds/1.0 (personal project)");
  });
});
