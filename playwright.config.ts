import { defineConfig, devices } from "@playwright/test";

const urlLocale = process.env.SIGAD_LOCAL_API_URL;

if (!urlLocale) throw new Error("SIGAD_LOCAL_API_URL doit cibler le Worker Cloudflare local pour les tests navigateur.");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: urlLocale,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(process.env.SIGAD_PLAYWRIGHT_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.SIGAD_PLAYWRIGHT_EXECUTABLE } }
      : {}),
    ...devices["Desktop Chrome"],
  },
  outputDir: "test-results",
});
