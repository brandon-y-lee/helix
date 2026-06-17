import { defineConfig, devices } from "@playwright/test";

// Port is overridable (PORT env) so e2e can run on a free port without
// colliding with a separate `next dev` server on the default 3000.
const PORT = Number(process.env.PORT) || 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  // E2E specs are qa-owned and live in e2e/**.
  testDir: "./e2e",
  // Verify the dev Supabase catalog is reachable + seeded before tests run, so
  // misconfiguration fails fast instead of hanging.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Build and start the production server so e2e hits real routes.
  // Bounded timeout so a server that never becomes ready fails fast.
  webServer: {
    command: "pnpm build && pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
