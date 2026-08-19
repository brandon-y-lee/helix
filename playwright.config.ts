import { defineConfig, devices } from "@playwright/test";

const verificationAdapter = process.env.HELIX_VERIFICATION_ADAPTER === "1";
const verificationBaseURL = process.env.HELIX_VERIFICATION_BASE_URL;
if (!verificationAdapter || !verificationBaseURL) {
  throw new Error(
    "Direct Playwright execution is unsupported. " +
      "Run pnpm e2e or pnpm verify:production instead.",
  );
}

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
    baseURL: verificationBaseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    ...(!process.env.CI
      ? [
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
          },
        ]
      : []),
  ],
});
