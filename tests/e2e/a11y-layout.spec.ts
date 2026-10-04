import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { cardFor, GAMES, resetMock } from "./helpers";

test.beforeEach(resetMock);

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const scan = (page: Page) => new AxeBuilder({ page }).withTags(WCAG).analyze();

test.describe("accessibility (WCAG 2.1 AA, N4)", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`game list, ${scheme} scheme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      await expect(cardFor(page, GAMES.liveNfl.id)).toBeVisible();
      expect((await scan(page)).violations).toEqual([]);
    });
  }

  for (const scheme of ["light", "dark"] as const) {
    test(`game list with every section open, ${scheme} scheme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      await expect(cardFor(page, GAMES.liveNfl.id)).toBeVisible();
      for (const s of await page.locator("summary").all()) await s.click();
      // Off-screen cards are skipped by content-visibility; force them to render so axe sees them.
      await page.addStyleTag({ content: ".card-cv { content-visibility: visible !important; }" });
      await expect(cardFor(page, GAMES.finalNfl.id)).toBeVisible();
      expect((await scan(page)).violations).toEqual([]);
    });
  }

  for (const [name, game] of [
    ["live", GAMES.liveNfl],
    ["upcoming", GAMES.preNfl],
    ["final", GAMES.finalNfl],
  ] as const) {
    test(`${name} game view`, async ({ page }) => {
      await page.goto(`/game/nfl/${game.id}`);
      await expect(page.getByRole("img", { name: /%/ }).first()).toBeVisible();
      expect((await scan(page)).violations).toEqual([]);
    });
  }

  test("everything interactive is reachable by keyboard", async ({ page }) => {
    await page.goto(`/game/nfl/${GAMES.liveNfl.id}`);
    const reached = new Set<string>();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      reached.add(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ""));
    }
    expect([...reached].join("|")).toMatch(/Games/);
    expect([...reached].join("|")).toMatch(/full screen/i);
  });
});

test.describe("layout (N5)", () => {
  const sizes = [
    { width: 360, height: 740 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 2560, height: 1440 },
  ];

  for (const size of sizes) {
    test(`no horizontal scroll at ${size.width}px`, async ({ page }) => {
      await page.setViewportSize(size);
      for (const url of ["/", `/game/nfl/${GAMES.liveNfl.id}`, `/game/nfl/${GAMES.finalNfl.id}`]) {
        await page.goto(url);
        await expect(page.getByRole("img").first()).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, url).toBeLessThanOrEqual(0);
      }
    });

    test(`game view fits its key parts at ${size.width}px`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto(`/game/nfl/${GAMES.liveNfl.id}`);
      const bar = page.getByRole("img", { name: /^Kansas City Chiefs/ });
      const chart = page.getByRole("img", { name: /^Home win probability/ });
      await expect(bar).toBeVisible();
      await expect(chart).toBeVisible();
      // The percentages must not be clipped by the viewport.
      const big = page.getByText("62.0%", { exact: true });
      const box = await big.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
      const chartBox = await chart.boundingBox();
      expect(chartBox!.height).toBeGreaterThan(100);
    });
  }

  test.describe("TV-size screens hide chrome when idle (G7)", () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test("header fades after 5s without input and returns on movement", async ({ page }) => {
      await page.goto(`/game/nfl/${GAMES.liveNfl.id}`);
      const header = page.locator("header");
      await expect(header).toHaveCSS("opacity", "1");
      await expect(header).toHaveCSS("opacity", "0", { timeout: 9000 });
      await page.mouse.move(200, 200);
      await expect(header).toHaveCSS("opacity", "1");
    });
  });

  test("header stays put on smaller screens", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/game/nfl/${GAMES.liveNfl.id}`);
    await page.waitForTimeout(6500);
    await expect(page.locator("header")).toHaveCSS("opacity", "1");
  });
});
