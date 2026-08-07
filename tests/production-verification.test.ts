import { describe, expect, it } from "vitest";
import {
  prepareProductionVerificationEnvironment,
  verifyFreshProductionArtifact,
  type ProductionVerificationAdapters,
} from "@/scripts/production-verification";

function makeAdapters(
  overrides: Partial<ProductionVerificationAdapters>,
): ProductionVerificationAdapters {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected production-verification adapter call.");
  };

  return {
    selectFreePort: unexpected,
    isPortAvailable: unexpected,
    build: unexpected,
    startServer: unexpected,
    waitForBuildIdentity: unexpected,
    runBrowserTests: unexpected,
    ...overrides,
  };
}

describe("Production Artifact Verification", () => {
  it("prepares one environment with deterministic ownership and precedence", () => {
    const environment = prepareProductionVerificationEnvironment({
      ambient: {
        NEXT_PUBLIC_SUPABASE_URL: "https://shell.example.test",
        PORT: "4200",
        SHELL_ONLY: "from-shell",
      },
      local: {
        CI: "1",
        MEI_PELLE_VERIFICATION_ADAPTER: "1",
        MEI_PELLE_VERIFICATION_BASE_URL: "http://untrusted.example.test",
        NEXT_PUBLIC_ALGOLIA_APP_ID: "local-app-id",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
        NEXT_PUBLIC_SUPABASE_URL: "https://local.example.test",
        NODE_ENV: "test",
        PLAYWRIGHT_HTML_OPEN: "always",
        PORT: "4100",
      },
    });

    expect(environment).toMatchObject({
      NEXT_PUBLIC_ALGOLIA_APP_ID: "testappid",
      NEXT_PUBLIC_ALGOLIA_INDEX_NAME: "mei_pelle_products",
      NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: "test-search-only-key",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://shell.example.test",
      NODE_ENV: "production",
      PORT: "4200",
      SHELL_ONLY: "from-shell",
      SUPABASE_CATALOG_WEBHOOK_SECRET: "e2e-test-secret",
    });
    expect(environment.CI).toBe("");
    expect(environment.MEI_PELLE_VERIFICATION_ADAPTER).toBe("");
    expect(environment.MEI_PELLE_VERIFICATION_BASE_URL).toBe("");
    expect(environment.PLAYWRIGHT_HTML_OPEN).toBe("");
  });

  it("verifies one fresh artifact and leaves no server running", async () => {
    let builds = 0;
    let browserRuns = 0;
    let running = false;
    let identityProven = false;

    const adapters = makeAdapters({
      selectFreePort: async () => 43_117,
      isPortAvailable: async () => true,
      build: async () => {
        builds += 1;
        return { buildId: "build-abc123" };
      },
      startServer: async ({ host, port }) => {
        expect(builds).toBe(1);
        expect({ host, port }).toEqual({ host: "127.0.0.1", port: 43_117 });
        running = true;
        return {
          stop: async () => {
            running = false;
          },
        };
      },
      waitForBuildIdentity: async ({ baseURL, buildId }) => {
        expect(running).toBe(true);
        expect({ baseURL, buildId }).toEqual({
          baseURL: "http://127.0.0.1:43117",
          buildId: "build-abc123",
        });
        identityProven = true;
      },
      runBrowserTests: async ({ baseURL }) => {
        expect(identityProven).toBe(true);
        expect(baseURL).toBe("http://127.0.0.1:43117");
        browserRuns += 1;
      },
    });

    await expect(
      verifyFreshProductionArtifact({}, adapters),
    ).resolves.toEqual({
      baseURL: "http://127.0.0.1:43117",
      buildId: "build-abc123",
      port: 43_117,
    });
    expect(builds).toBe(1);
    expect(browserRuns).toBe(1);
    expect(running).toBe(false);
  });

  it.each(["", "0", "65536", "3.5", "1e3", "0x10", "+3000", "not-a-port"])(
    "rejects invalid explicit port %j before building",
    async (requestedPort) => {
      let builds = 0;
      const adapters = makeAdapters({
        build: async () => {
          builds += 1;
          return { buildId: "unexpected" };
        },
      });

      await expect(
        verifyFreshProductionArtifact({ requestedPort }, adapters),
      ).rejects.toThrow(
        "Production verification requires PORT to be an integer from 1 through 65535.",
      );
      expect(builds).toBe(0);
    },
  );

  it("rejects an occupied explicit port before building", async () => {
    let builds = 0;
    const adapters = makeAdapters({
      isPortAvailable: async () => false,
      build: async () => {
        builds += 1;
        return { buildId: "unexpected" };
      },
    });

    await expect(
      verifyFreshProductionArtifact({ requestedPort: "3107" }, adapters),
    ).rejects.toThrow("Production verification cannot use occupied PORT 3107.");
    expect(builds).toBe(0);
  });

  it("uses an available explicit port without selecting another one", async () => {
    let checkedPort: number | undefined;
    const adapters = makeAdapters({
      isPortAvailable: async ({ port }) => {
        checkedPort = port;
        return true;
      },
      build: async () => ({ buildId: "explicit-port-build" }),
      startServer: async () => ({ stop: async () => {} }),
      waitForBuildIdentity: async () => {},
      runBrowserTests: async () => {},
    });

    await expect(
      verifyFreshProductionArtifact({ requestedPort: "3107" }, adapters),
    ).resolves.toMatchObject({
      baseURL: "http://127.0.0.1:3107",
      port: 3_107,
    });
    expect(checkedPort).toBe(3_107);
  });

  it("blocks browser tests and stops the server when build identity is wrong", async () => {
    let browserRuns = 0;
    let running = false;
    const adapters = makeAdapters({
      selectFreePort: async () => 43_118,
      isPortAvailable: async () => true,
      build: async () => ({ buildId: "expected-build" }),
      startServer: async () => {
        running = true;
        return {
          stop: async () => {
            running = false;
          },
        };
      },
      waitForBuildIdentity: async () => {
        throw new Error("Running server does not expose expected-build.");
      },
      runBrowserTests: async () => {
        browserRuns += 1;
      },
    });

    await expect(
      verifyFreshProductionArtifact({}, adapters),
    ).rejects.toThrow("Running server does not expose expected-build.");
    expect(browserRuns).toBe(0);
    expect(running).toBe(false);
  });

  it("stops the server after an ordinary browser-test failure", async () => {
    let running = false;
    const adapters = makeAdapters({
      selectFreePort: async () => 43_119,
      isPortAvailable: async () => true,
      build: async () => ({ buildId: "browser-failure-build" }),
      startServer: async () => {
        running = true;
        return {
          stop: async () => {
            running = false;
          },
        };
      },
      waitForBuildIdentity: async () => {},
      runBrowserTests: async () => {
        throw new Error("Playwright failed.");
      },
    });

    await expect(
      verifyFreshProductionArtifact({}, adapters),
    ).rejects.toThrow("Playwright failed.");
    expect(running).toBe(false);
  });
});
