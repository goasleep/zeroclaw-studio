import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e/browser",
  testMatch: ["*.spec.ts"],
  outputDir: "test-results/zeroclaw-studio-browser",
  reporter: [["list"], ["html", { outputFolder: "playwright-report/zeroclaw-studio-browser" }]],
  use: {
    baseURL: "http://127.0.0.1:5183",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "zeroclaw-studio-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node tests/e2e/browser/dev-server.mjs",
    url: "http://127.0.0.1:5183",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
