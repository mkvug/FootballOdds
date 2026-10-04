import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 3100;
const MOCK_PORT = 4010;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  // One shared mock ESPN and one app server: tests reset and drive that state, so run serially.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/e2e/mock-espn.mjs",
      url: `http://127.0.0.1:${MOCK_PORT}/__control`,
      reuseExistingServer: false,
      env: { MOCK_ESPN_PORT: String(MOCK_PORT) },
    },
    {
      // Production build, with short intervals so tests don't wait out real 5s/30s polling.
      command: `npm run build && npm run start -- -H 127.0.0.1 -p ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ESPN_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        // What the browser fallback calls when our server reports ESPN as unreachable.
        NEXT_PUBLIC_ESPN_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        CACHE_TTL_LIVE_S: "1",
        CACHE_TTL_LIST_S: "1",
        CACHE_TTL_IDLE_S: "1",
        NEXT_PUBLIC_POLL_LIVE_MS: "1500",
        NEXT_PUBLIC_POLL_LIST_MS: "2000",
      },
    },
  ],
});
