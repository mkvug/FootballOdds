import { expect, test } from "@playwright/test";
import { control, dividerPercent, GAMES, resetMock, settleCache } from "./helpers";

const G = GAMES.liveNfl;
const url = `/game/nfl/${G.id}`;
const bar = (page: import("@playwright/test").Page) =>
  page.getByRole("img", { name: /^Kansas City Chiefs .*%, Las Vegas Raiders .*%$/ });

test.beforeEach(resetMock);

test.describe("live game view", () => {
  test("shows the live state: teams, score, clock, probability (G1, G2)", async ({ page }) => {
    await page.goto(url);

    await expect(page.getByText("Live", { exact: true })).toBeVisible();
    await expect(page.getByText("Q3 · 4:12")).toBeVisible();
    await expect(page.getByText(G.awayNick, { exact: true })).toBeVisible();
    await expect(page.getByText(G.homeNick, { exact: true })).toBeVisible();
    await expect(page.getByText("24", { exact: true })).toBeVisible();
    await expect(page.getByText("17", { exact: true })).toBeVisible();

    await expect(bar(page)).toHaveAccessibleName("Kansas City Chiefs 38.0%, Las Vegas Raiders 62.0%");
    // The big numbers settle on the same values after their count-up.
    await expect(page.getByText("62.0%", { exact: true })).toBeVisible();
    await expect(page.getByText("38.0%", { exact: true })).toBeVisible();
  });

  test("draws a divider where the two shares meet and moves it with the odds", async ({ page }) => {
    await page.goto(url);
    const divider = page.getByTestId("bar-divider");
    await expect(divider).toHaveCount(1);
    expect(await dividerPercent(divider)).toBeCloseTo(38, 5);

    await control({ append: 0.7 });
    await expect.poll(() => dividerPercent(divider)).toBeCloseTo(30, 5);
  });

  test("shows the market line, last play and source (G5, G6)", async ({ page }) => {
    await page.goto(url);
    await expect(page.getByText(/Market \(DraftKings\):/)).toBeVisible();
    await expect(page.getByText("KC -210 · LV +175")).toBeVisible();
    await expect(page.getByText("→ 65% / 35%")).toBeVisible();
    await expect(page.getByText("P.Mahomes pass complete to T.Kelce for 12 yds")).toBeVisible();
    await expect(page.getByText(/Updated \d+s ago/)).toBeVisible();
    await expect(page.getByText("Source: ESPN win probability")).toBeVisible();
  });

  test("draws the timeline with quarter markers (G3)", async ({ page }) => {
    await page.goto(url);
    const chart = page.getByRole("img", { name: /^Home win probability over the game/ });
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAccessibleName(/Las Vegas Raiders now 62 percent, Kansas City Chiefs 38 percent/);
    for (const q of ["Q1", "Q2"]) await expect(page.getByText(q, { exact: true })).toBeVisible();
  });

  test("keeps the tab title current (G10)", async ({ page }) => {
    await page.goto(url);
    await expect(page).toHaveTitle("KC 38% – LV 62% · FootballOdds");
    await control({ append: 0.7 });
    await expect(page).toHaveTitle("KC 30% – LV 70% · FootballOdds");
  });

  test("moves the bar when probability changes, without a reload (G1)", async ({ page }) => {
    await page.goto(url);
    await expect(bar(page)).toHaveAccessibleName(/Las Vegas Raiders 62\.0%/);

    await control({ append: 0.7 });
    await expect(bar(page)).toHaveAccessibleName("Kansas City Chiefs 30.0%, Las Vegas Raiders 70.0%");
    await expect(page.getByText("70.0%", { exact: true })).toBeVisible();

    // Polling continues: the next change lands too.
    await control({ append: 0.55 });
    await expect(bar(page)).toHaveAccessibleName(/Las Vegas Raiders 55\.0%/);
  });

  test("flashes a toast for a 10-point swing toward the home team (G4)", async ({ page }) => {
    await page.goto(url);
    await expect(bar(page)).toBeVisible();
    await control({ append: 0.95 });
    await expect(page.getByRole("status").filter({ hasText: "Big swing" })).toContainText("Big swing: LV +33%");
  });

  test("flashes a toast for a swing toward the visitors (G4)", async ({ page }) => {
    await page.goto(url);
    await expect(bar(page)).toBeVisible();
    await control({ append: 0.4 });
    await expect(page.getByRole("status").filter({ hasText: "Big swing" })).toContainText("Big swing: KC +22%");
  });

  test("stays quiet for small moves and for swings that happened before you arrived (G4)", async ({ page }) => {
    // A big swing already in history must not toast on load.
    await control({ append: 0.95 });
    await settleCache();
    await page.goto(url);
    await expect(bar(page)).toHaveAccessibleName(/Las Vegas Raiders 95\.0%/);

    await control({ append: 0.93 });
    await expect(bar(page)).toHaveAccessibleName(/Las Vegas Raiders 93\.0%/);
    await expect(page.getByText("Big swing")).toHaveCount(0);
  });

  test("flags stale data as Delayed and recovers (G6, spec §9)", async ({ page }) => {
    await page.goto(url);
    await expect(bar(page)).toBeVisible();
    await expect(page.getByText("Delayed")).toHaveCount(0);

    await control({ mode: "summaryDown" });
    await expect(page.getByText("Delayed")).toBeVisible();
    // The last good numbers stay on screen rather than blanking.
    await expect(bar(page)).toHaveAccessibleName(/Las Vegas Raiders 62\.0%/);

    await control({ mode: "normal" });
    await expect(page.getByText("Delayed")).toHaveCount(0);
  });

  test("announces the favourite to screen readers, without numbers (N4)", async ({ page }) => {
    await page.goto(url);
    const live = page.locator('[aria-live="polite"]');
    await expect(live).toHaveText("Las Vegas Raiders now favored to win.");
  });

  test("toggles full screen (G7)", async ({ page }) => {
    await page.goto(url);
    const button = page.getByRole("button", { name: "Enter full screen" });
    await button.click();
    await expect(page.getByRole("button", { name: "Exit full screen" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Exit full screen" }).click();
    await expect(page.getByRole("button", { name: "Enter full screen" })).toHaveAttribute("aria-pressed", "false");
  });

  test("links back to the list", async ({ page }) => {
    await page.goto(url);
    await page.getByRole("link", { name: "← Games" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: /NFL live/ })).toBeVisible();
  });

  test("carries the responsible-gambling notice (N6)", async ({ page }) => {
    await page.goto(url);
    await expect(page.getByText(/1-800-GAMBLER/)).toBeVisible();
  });
});

test.describe("motion preferences (N4)", () => {
  const segment = (page: import("@playwright/test").Page) => page.locator(".bar-seg").first();

  test("animates the bar by default", async ({ page }) => {
    await page.goto(url);
    await expect(segment(page)).toHaveCSS("transition-duration", "0.6s");
  });

  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("turns the bar animation off and still shows the toast", async ({ page }) => {
      await page.goto(url);
      await expect(segment(page)).toHaveCSS("transition-duration", "0s");

      await control({ append: 0.95 });
      await expect(page.getByText(/Big swing: LV/)).toBeVisible();
      await expect(page.getByText("95.0%", { exact: true })).toBeVisible();
    });
  });
});
