import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Port is overridable (PORT env) so e2e can run on a free port without
// colliding with a separate `next dev` server on the default 3000.
const PORT = Number(process.env.PORT) || 3000;
const verificationAdapter = process.env.MEI_PELLE_VERIFICATION_ADAPTER === "1";
const verificationBaseURL = process.env.MEI_PELLE_VERIFICATION_BASE_URL;
if (verificationAdapter && !verificationBaseURL) {
  throw new Error(
    "Production verification did not provide MEI_PELLE_VERIFICATION_BASE_URL.",
  );
}
const baseURL = verificationBaseURL ?? `http://localhost:${PORT}`;

// Read .env.local so the built test server gets the same dev Supabase
// credentials the app uses. (Mirrors e2e/global-setup's loader.)
function readEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[match[1]] = value;
    }
  } catch {
    // No .env.local — rely on the ambient environment.
  }
  return out;
}

// Deterministic, NON-SECRET Algolia values for e2e. The browser search client
// builds against these and issues requests to the Algolia host, which the
// search spec intercepts with page.route — so no live Algolia is contacted.
// The webhook secret lets the unauthorized-request test exercise the 401 path.
const E2E_SEARCH_ENV = {
  NEXT_PUBLIC_ALGOLIA_APP_ID: "testappid",
  NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: "test-search-only-key",
  NEXT_PUBLIC_ALGOLIA_INDEX_NAME: "mei_pelle_products",
  SUPABASE_CATALOG_WEBHOOK_SECRET: "e2e-test-secret",
};

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
    ...(!process.env.CI
      ? [
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
          },
        ]
      : []),
  ],
  // Ticket #4 adds an adapter mode beside the legacy Playwright-owned server.
  // Ticket #5 migrates every caller, then removes this compatibility path.
  ...(verificationAdapter
    ? {}
    : {
        webServer: {
          command: "pnpm build && pnpm start",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: { ...process.env, ...readEnvLocal(), ...E2E_SEARCH_ENV },
        },
      }),
});
