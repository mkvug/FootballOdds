import { expect, test } from "@playwright/test";
import { cardFor, control, dividerPercent, GAMES, resetMock } from "./helpers";

// Simulates the Vercel failure: our server answers 502 "Upstream unavailable" because ESPN
// refuses its IP. The browser must then fetch ESPN itself and the app must carry on.

test.beforeEach(resetMock);

const serverCannotReachEspn = async (page: import("@playwright/test").Page) => {
  const hits = { list: 0, game: 0 };
  await page.route("**/api/games", (route) => {
    hits.list++;
    return route.fulfill({ status: 502, contentType: "application/json", body: '{"error":"Upstream unavailable"}' });
  });
  await page.route("**/api/games/**", (route) => {
    hits.game++;
    return route.fulfill({ status: 502, contentType: "application/json", body: '{"error":"Upstream unavailable"}' });
  });
  return hits;
};

test.describe("when the server cannot reach ESPN", () => {
  test("the game list loads straight from ESPN in the browser", async ({ page }) => {
    await serverCannotReachEspn(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /NFL live/ })).toBeVisible();
    await expect(cardFor(page, GAMES.liveNfl.id)).toBeVisible();
    await expect(cardFor(page, GAMES.liveNcaaf.id)).toBeVisible();
    // Probability works on both paths: via the summary (NFL) and the scoreboard (college).
    await expect(cardFor(page, GAMES.liveNfl.id).getByRole("img", { name: "Las Vegas Raiders 62% to win" })).toBeVisible();
    await expect(cardFor(page, GAMES.liveNcaaf.id).getByRole("img", { name: /Vanderbilt Commodores 65% to win/ })).toBeVisible();
  });

  test("keeps updating without hammering the failing server", async ({ page }) => {
    test.setTimeout(60_000);
    const hits = await serverCannotReachEspn(page);
    await page.goto("/");
    const card = cardFor(page, GAMES.liveNcaaf.id);
    await expect(card.getByRole("img", { name: /65% to win/ })).toBeVisible();

    // The browser's own cache keeps the default 15s list TTL (the shortened E2E TTLs are
    // server-only), so allow for it.
    await control({ ncaafHome: 0.8 });
    await expect(card.getByRole("img", { name: "Georgia Bulldogs 80% to win" })).toBeVisible({ timeout: 25_000 });
    // After the first 502 the app stops asking the server for a while (several polls have run).
    expect(hits.list).toBe(1);
  });

  test("the full-screen view works and follows the game live", async ({ page }) => {
    const hits = await serverCannotReachEspn(page);
    await page.goto(`/game/nfl/${GAMES.liveNfl.id}`);

    const bar = page.getByRole("img", { name: /^Kansas City Chiefs .*%, Las Vegas Raiders .*%$/ });
    await expect(bar).toBeVisible();
    await expect(page.getByText("Q3 · 4:12")).toBeVisible();

    await control({ append: 0.7 });
    await expect(bar).toHaveAccessibleName("Kansas City Chiefs 30.0%, Las Vegas Raiders 70.0%");
    expect(await dividerPercent(page.getByTestId("bar-divider"))).toBeCloseTo(30, 5);

    // A big swing still toasts, and the timeline grows by merging only new points.
    await control({ append: 0.95 });
    await expect(page.getByText(/Big swing: LV \+25%/)).toBeVisible();
    expect(hits.game).toBe(1);
  });

  test("a game ESPN says doesn't exist is still a 'not found', not an outage", async ({ page }) => {
    await serverCannotReachEspn(page);
    // The server-rendered page asks the (working) mock, which has no such game.
    const res = await page.goto("/game/nfl/999999999");
    expect(res?.status()).toBe(404);
  });
});
