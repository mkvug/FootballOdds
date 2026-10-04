import { expect, test } from "@playwright/test";
import { cardFor, control, dividerPercent, GAMES, resetMock, section, settleCache } from "./helpers";

test.beforeEach(resetMock);

test.describe("game list", () => {
  test("groups live games by league and collapses the rest (L1, L3)", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /NFL live/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /College live/ })).toBeVisible();
    await expect(cardFor(page, GAMES.liveNfl.id)).toBeVisible();
    await expect(cardFor(page, GAMES.liveNcaaf.id)).toBeVisible();

    // Finished and upcoming games exist but start collapsed while something is live.
    await expect(section(page, "Upcoming")).toHaveJSProperty("open", false);
    await expect(section(page, "Final")).toHaveJSProperty("open", false);
    await expect(cardFor(page, GAMES.finalNfl.id)).toBeHidden();

    await section(page, "Final").locator("summary").click();
    await expect(cardFor(page, GAMES.finalNfl.id)).toBeVisible();
  });

  test("a live card shows teams, score, clock and a probability bar (L2)", async ({ page }) => {
    await page.goto("/");
    const card = cardFor(page, GAMES.liveNfl.id);

    await expect(card).toHaveAttribute("aria-label", /Chiefs at Las Vegas Raiders, Q3 · 4:12/);
    await expect(card).toContainText("KC");
    await expect(card).toContainText("LV");
    await expect(card).toContainText("24");
    await expect(card).toContainText("17");
    await expect(card).toContainText("Live");
    // NFL probability arrives via the game summary (62% home).
    await expect(card.getByRole("img", { name: "Las Vegas Raiders 62% to win" })).toBeVisible();
  });

  test("marks where the two teams' shares meet with a divider on the card bar", async ({ page }) => {
    await page.goto("/");
    const divider = cardFor(page, GAMES.liveNfl.id).getByTestId("bar-divider");
    await expect(divider).toHaveCount(1);
    // Visitors hold 38%, so the boundary sits 38% along the bar.
    expect(await dividerPercent(divider)).toBeCloseTo(38, 5);

    await control({ ncaafHome: 0.8 });
    const college = cardFor(page, GAMES.liveNcaaf.id).getByTestId("bar-divider");
    await expect.poll(() => dividerPercent(college)).toBeCloseTo(20, 5);
  });

  test("uses the scoreboard's own probability when it has one", async ({ page }) => {
    await page.goto("/");
    // College mock embeds situation.lastPlay.probability: home 35% -> visitor leads at 65%.
    await expect(
      cardFor(page, GAMES.liveNcaaf.id).getByRole("img", { name: "Vanderbilt Commodores 65% to win" }),
    ).toBeVisible();
  });

  test("refreshes on its own without a reload (L5)", async ({ page }) => {
    await page.goto("/");
    const card = cardFor(page, GAMES.liveNcaaf.id);
    await expect(card.getByRole("img", { name: /65% to win/ })).toBeVisible();

    await control({ ncaafHome: 0.8 });
    await expect(card.getByRole("img", { name: "Georgia Bulldogs 80% to win" })).toBeVisible();
  });

  test("league chips filter the list (L7)", async ({ page }) => {
    await page.goto("/");
    const all = page.getByRole("button", { name: "All" });
    const nfl = page.getByRole("button", { name: "NFL", exact: true });
    await expect(all).toHaveAttribute("aria-pressed", "true");

    await nfl.click();
    await expect(nfl).toHaveAttribute("aria-pressed", "true");
    await expect(cardFor(page, GAMES.liveNfl.id)).toBeVisible();
    await expect(page.getByRole("heading", { name: /College live/ })).toBeHidden();
    await expect(cardFor(page, GAMES.liveNcaaf.id)).toBeHidden();

    await page.getByRole("button", { name: "College" }).click();
    await expect(cardFor(page, GAMES.liveNcaaf.id)).toBeVisible();
    await expect(page.getByRole("heading", { name: /NFL live/ })).toBeHidden();
  });

  test("search matches team names (L7)", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Search teams").fill("Packers");

    // Nothing live matches, so the empty state shows and Upcoming opens to reveal the match.
    await expect(page.getByText("No games live right now")).toBeVisible();
    await expect(page.getByText("Nothing matches your search.")).toBeVisible();
    await expect(section(page, "Upcoming")).toHaveJSProperty("open", true);
    await expect(page.getByRole("link", { name: /Green Bay Packers at Tampa Bay Buccaneers/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Seattle Seahawks/ })).toBeHidden();

    await page.getByLabel("Search teams").fill("chiefs");
    await expect(cardFor(page, GAMES.liveNfl.id)).toBeVisible();
  });

  test("empty state names the next kickoff and opens Upcoming (L4)", async ({ page }) => {
    await control({ mode: "noLive" });
    await settleCache();
    await page.goto("/");

    await expect(page.getByText("No games live right now")).toBeVisible();
    await expect(page.getByText(/Next kickoff: .+ at .+/)).toBeVisible();
    await expect(section(page, "Upcoming")).toHaveJSProperty("open", true);
    await expect(cardFor(page, GAMES.preNfl.id)).toBeVisible();
  });

  test("a card opens its game by click and by keyboard (L6)", async ({ page }) => {
    await page.goto("/");
    await cardFor(page, GAMES.liveNfl.id).click();
    await expect(page).toHaveURL(`/game/nfl/${GAMES.liveNfl.id}`);

    await page.goto("/");
    await cardFor(page, GAMES.liveNcaaf.id).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`/game/ncaaf/${GAMES.liveNcaaf.id}`);
  });

  test("keeps showing the last data and says so when ESPN stops answering (spec §9)", async ({ page }) => {
    await page.goto("/");
    await expect(cardFor(page, GAMES.liveNcaaf.id)).toBeVisible();

    await control({ mode: "ncaafDown" });
    await expect(page.getByRole("status")).toContainText(/last known data/);
    await expect(cardFor(page, GAMES.liveNcaaf.id)).toBeVisible();
    await expect(cardFor(page, GAMES.liveNfl.id)).toBeVisible();
  });

  test("shows an error with a retry when our own API is unreachable", async ({ page }) => {
    await page.route("**/api/games", (route) => route.fulfill({ status: 502, body: "{}" }));
    await page.goto("/");
    await expect(page.getByRole("alert").filter({ hasText: "Can't reach the scoreboard" })).toBeVisible();

    await page.unroute("**/api/games");
    await page.getByRole("button", { name: "Try now" }).click();
    await expect(cardFor(page, GAMES.liveNfl.id)).toBeVisible();
  });

  test("carries the responsible-gambling notice (N6)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Not betting advice\. 21\+\. Gambling problem\? Call 1-800-GAMBLER\./)).toBeVisible();
  });
});
