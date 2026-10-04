import { beforeEach, describe, expect, it, vi } from "vitest";
import { cached, clearCache } from "@/lib/cache";

beforeEach(() => {
  clearCache();
  vi.useRealTimers();
});

describe("cached", () => {
  it("serves repeat calls from cache within the TTL", async () => {
    const load = vi.fn().mockResolvedValue("a");
    await cached("k", 1000, load);
    const second = await cached("k", 1000, load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ value: "a", stale: false });
  });

  it("shares one in-flight request between concurrent callers (N2)", async () => {
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const calls = [cached("k", 1000, load), cached("k", 1000, load), cached("k", 1000, load)];
    resolve("x");
    const results = await Promise.all(calls);
    expect(load).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.value === "x")).toBe(true);
  });

  it("reloads after the TTL expires", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce("a").mockResolvedValueOnce("b");
    await cached("k", 1000, load);
    vi.advanceTimersByTime(1500);
    expect((await cached("k", 1000, load)).value).toBe("b");
  });

  it("serves the last good value as stale when the reload fails (spec §9)", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce("good").mockRejectedValueOnce(new Error("boom"));
    await cached("k", 1000, load);
    vi.advanceTimersByTime(1500);
    expect(await cached("k", 1000, load)).toMatchObject({ value: "good", stale: true });
  });

  it("throws when there is nothing to fall back to", async () => {
    await expect(cached("k", 1000, () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  });

  it("accepts a TTL computed from the value", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue({ live: true });
    const ttl = (v: { live: boolean }) => (v.live ? 100 : 10_000);
    await cached("k", ttl, load);
    vi.advanceTimersByTime(200);
    await cached("k", ttl, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
