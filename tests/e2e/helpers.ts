import { expect, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:4010";

// Mirrors the cast in mock-espn.mjs.
export const GAMES = {
  liveNfl: { id: "401872976", away: "KC", home: "LV", awayNick: "Chiefs", homeNick: "Raiders" },
  liveNcaaf: { id: "401856705", away: "VAN", home: "UGA", awayNick: "Commodores", homeNick: "Bulldogs" },
  finalNfl: { id: "401872964", away: "PIT", home: "CLE", awayNick: "Steelers", homeNick: "Browns" },
  preNfl: { id: "401872965", away: "IND", home: "WSH", awayNick: "Colts", homeNick: "Commanders" },
} as const;

export type MockMode = "normal" | "noLive" | "ncaafDown" | "summaryDown" | "allDown";

export async function control(body: {
  reset?: boolean;
  mode?: MockMode;
  append?: number;
  ncaafHome?: number;
}) {
  const res = await fetch(`${MOCK}/__control`, { method: "POST", body: JSON.stringify(body) });
  expect(res.ok).toBe(true);
}

export async function requestCounts(): Promise<Record<string, number>> {
  const res = await fetch(`${MOCK}/__control`);
  return (await res.json()).requests;
}

/** The app's server cache is 1s in E2E; wait it out so the next request sees a mock change. */
export const settleCache = () => new Promise((r) => setTimeout(r, 1300));

/** Back to the default scenario. */
export async function resetMock() {
  await control({ reset: true });
  await settleCache();
}

export const cardFor = (page: Page, id: string) =>
  page.locator(`a[href$="/${id}"]`);

/** A collapsible list section ("Upcoming", "Final"). */
export const section = (page: Page, title: string) =>
  page.locator("details").filter({ has: page.locator("summary", { hasText: title }) });

/** Left offset (0-100) of a bar's divider element. */
export async function dividerPercent(divider: import("@playwright/test").Locator): Promise<number> {
  return divider.evaluate((el) => parseFloat((el as HTMLElement).style.left));
}
