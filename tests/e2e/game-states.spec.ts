import { expect, test } from "@playwright/test";
import { GAMES, resetMock } from "./helpers";

test.beforeEach(resetMock);

test.describe("upcoming game (G8)", () => {
  const G = GAMES.preNfl;

  test("counts down to kickoff and uses the betting market", async ({ page }) => {
    await page.goto(`/game/nfl/${G.id}`);

    await expect(page.getByText("Upcoming", { exact: true })).toBeVisible();
    await expect(page.getByText("to kickoff")).toBeVisible();
    await expect(page.getByRole("img", { name: /^Indianapolis Colts 65\.1%, Washington Commanders 34\.9%$/ })).toBeVisible();
    await expect(page.getByText("Source: DraftKings odds, vig removed")).toBeVisible();
    await expect(page.getByText("The win-probability timeline starts at kickoff.")).toBeVisible();
    // No scores before kickoff.
    await expect(page.getByText("0", { exact: true })).toHaveCount(0);
  });
});

test.describe("final game (G8)", () => {
  const G = GAMES.finalNfl;
  const url = `/game/nfl/${G.id}`;

  test("freezes on the final result with the whole-game timeline", async ({ page }) => {
    await page.goto(url);

    await expect(page.getByText("Final", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("24", { exact: true })).toBeVisible();
    await expect(page.getByText("27", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Pittsburgh Steelers 0.0%, Cleveland Browns 100.0%" })).toBeVisible();
    for (const q of ["Q1", "Q2", "Q3", "Q4"]) await expect(page.getByText(q, { exact: true })).toBeVisible();
    await expect(page.getByText("Final · Source: ESPN win probability")).toBeVisible();
    await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Delayed")).toHaveCount(0);
  });

  test("draws no divider when one side holds 100%", async ({ page }) => {
    await page.goto(url);
    await expect(page.getByRole("img", { name: /Cleveland Browns 100\.0%/ })).toBeVisible();
    await expect(page.getByTestId("bar-divider")).toHaveCount(0);
  });

  test("stops polling once the game is over (spec §7)", async ({ page }) => {
    let hits = 0;
    page.on("request", (r) => r.url().includes(`/api/games/nfl/${G.id}`) && hits++);

    await page.goto(url);
    await expect(page.getByText("Final · Source")).toBeVisible();
    await page.waitForTimeout(2500); // the one refetch on mount is done by now
    const settled = hits;
    await page.waitForTimeout(5000); // > 3 live polling periods in this setup
    expect(hits).toBe(settled);
  });

  test("a live game, by contrast, keeps polling", async ({ page }) => {
    let hits = 0;
    page.on("request", (r) => r.url().includes(`/api/games/nfl/${GAMES.liveNfl.id}`) && hits++);
    await page.goto(`/game/nfl/${GAMES.liveNfl.id}`);
    await page.waitForTimeout(2500);
    const settled = hits;
    await page.waitForTimeout(5000);
    expect(hits).toBeGreaterThan(settled + 1);
  });

  test("polling sends the last sequence it holds, not the whole history (spec §7)", async ({ page }) => {
    const sinces: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.pathname === `/api/games/nfl/${GAMES.liveNfl.id}`) sinces.push(u.searchParams.get("since") ?? "");
    });
    await page.goto(`/game/nfl/${GAMES.liveNfl.id}`);
    await expect.poll(() => sinces.length, { timeout: 8000 }).toBeGreaterThan(1);
    // Server-rendered history ends at seq 119, so the client asks for what follows it.
    expect(sinces.at(-1)).toBe("119");
  });
});

test.describe("missing games (spec §9)", () => {
  test("an unknown event gets a 404 page with a way back", async ({ page }) => {
    const res = await page.goto("/game/nfl/999999999");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Game not found" })).toBeVisible();
    await page.getByRole("link", { name: "Back to all games" }).click();
    await expect(page).toHaveURL("/");
  });

  test("an unknown league is a 404 too", async ({ page }) => {
    const res = await page.goto("/game/mlb/1");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Game not found" })).toBeVisible();
  });

  test("a malformed event id is a 404, not an upstream request", async ({ page }) => {
    const res = await page.goto("/game/nfl/..%2Fsecret");
    expect(res?.status()).toBe(404);
  });
});
