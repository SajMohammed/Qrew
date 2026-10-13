import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { parse } from "dotenv";
import { API, CARDS, SHOP } from "./servers";

/*
 * The suite runs its own API and the PRODUCTION builds of both apps, on ports clear of the dev stack,
 * against its own database and Redis database. So it can run while `pnpm dev` is up, and never reads
 * or writes development data. Build first: the root `pnpm e2e` does.
 */

// Clerk's test keys come from CI secrets, or from the repo-root .env on a laptop. Only these two
// are read from that file; the API below gets an explicit environment, not development's.
const rootEnv = resolve(__dirname, "../.env");
const local = existsSync(rootEnv) ? parse(readFileSync(rootEnv)) : {};
for (const key of ["CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"]) process.env[key] ??= local[key];

export default defineConfig({
  testDir: "tests",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    // The card app's service worker must not answer for the network in the middle of a journey.
    serviceWorkers: "block",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "journeys",
      testMatch: /\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node dist/main.js",
      cwd: "../apps/api",
      url: `${API}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        API_PORT: "4410",
        DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/qrew_e2e",
        DATABASE_URL_APP:
          process.env.E2E_DATABASE_URL_APP ?? "postgres://qrew_app:qrew_app@localhost:5432/qrew_e2e",
        // Database 1, so a running dev worker never picks up the suite's wallet jobs.
        REDIS_URL: process.env.E2E_REDIS_URL ?? "redis://localhost:6379/1",
        WALLET_PROVIDER: "fake",
        // The test scans a card three times in a row; the anti-double-tap window would eat two.
        STAMP_COOLDOWN_SECONDS: "0",
        AUTH_DEV_BYPASS: "false",
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? "",
      },
    },
    {
      command: "pnpm exec vite preview --port 5473 --strictPort",
      cwd: "../apps/card",
      url: CARDS,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: API },
    },
    {
      command: "pnpm exec vite preview --port 5475 --strictPort",
      cwd: "../apps/dashboard",
      url: SHOP,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: API },
    },
  ],
});
