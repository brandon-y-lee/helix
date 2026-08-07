import { describe, expect, it } from "vitest";
import {
  prepareProductionVerificationEnvironment,
  verifyFreshProductionArtifact,
  type ProductionVerificationAdapters,
  type ProductionVerificationDiagnostic,
} from "@/scripts/production-verification";

function makeAdapters(
  overrides: Partial<ProductionVerificationAdapters>,
): ProductionVerificationAdapters {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected production-verification adapter call.");
  };

  return {
    acquireLock: async () => ({ release: async () => {} }),
    selectFreePort: unexpected,
    isPortAvailable: unexpected,
    build: unexpected,
    startServer: unexpected,
    waitForBuildIdentity: unexpected,
    runBrowserTests: unexpected,
    now: () => 0,
    report: () => {},
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
        NODE_OPTIONS: "--inspect",
        PLAYWRIGHT_HTML_OPEN: "always",
        PORT: "4100",
        TZ: "Pacific/Honolulu",
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
    expect(environment.NODE_OPTIONS).toBe("");
    expect(environment.PLAYWRIGHT_HTML_OPEN).toBe("");
    expect(environment.TZ).toBe("");
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
          exited: new Promise(() => {}),
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
      startServer: async () => ({
        exited: new Promise(() => {}),
        stop: async () => {},
      }),
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
          exited: new Promise(() => {}),
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
          exited: new Promise(() => {}),
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

  it("reports each lifecycle phase with safe diagnostic context", async () => {
    const diagnostics: ProductionVerificationDiagnostic[] = [];
    let elapsed = 0;
    const adapters = makeAdapters({
      now: () => elapsed,
      report: (diagnostic) => diagnostics.push(diagnostic),
      selectFreePort: async () => 43_120,
      build: async () => {
        elapsed = 20;
        return { buildId: "diagnostic-build" };
      },
      startServer: async () => ({
        exited: new Promise(() => {}),
        stop: async () => {
          elapsed = 50;
        },
      }),
      waitForBuildIdentity: async ({ timeoutMs }) => {
        expect(timeoutMs).toBe(120_000);
        elapsed = 35;
      },
      runBrowserTests: async () => {
        elapsed = 45;
      },
    });

    await verifyFreshProductionArtifact({}, adapters);

    expect(diagnostics).toEqual([
      {
        buildId: undefined,
        childExitReason: undefined,
        elapsedMs: 0,
        phase: "preflight",
        port: undefined,
        status: "started",
      },
      {
        buildId: undefined,
        childExitReason: undefined,
        elapsedMs: 0,
        phase: "preflight",
        port: 43_120,
        status: "passed",
      },
      {
        buildId: undefined,
        childExitReason: undefined,
        elapsedMs: 0,
        phase: "production-build",
        port: 43_120,
        status: "started",
      },
      {
        buildId: "diagnostic-build",
        childExitReason: undefined,
        elapsedMs: 20,
        phase: "production-build",
        port: 43_120,
        status: "passed",
      },
      {
        buildId: "diagnostic-build",
        childExitReason: undefined,
        elapsedMs: 20,
        phase: "server-start-and-identity",
        port: 43_120,
        status: "started",
      },
      {
        buildId: "diagnostic-build",
        childExitReason: undefined,
        elapsedMs: 35,
        phase: "server-start-and-identity",
        port: 43_120,
        status: "passed",
      },
      {
        buildId: "diagnostic-build",
        childExitReason: undefined,
        elapsedMs: 35,
        phase: "browser-test",
        port: 43_120,
        status: "started",
      },
      {
        buildId: "diagnostic-build",
        childExitReason: undefined,
        elapsedMs: 45,
        phase: "browser-test",
        port: 43_120,
        status: "passed",
      },
      {
        buildId: "diagnostic-build",
        childExitReason: undefined,
        elapsedMs: 45,
        phase: "cleanup",
        port: 43_120,
        status: "started",
      },
      {
        buildId: "diagnostic-build",
        childExitReason: undefined,
        elapsedMs: 50,
        phase: "cleanup",
        port: 43_120,
        status: "passed",
      },
    ]);
  });

  it("fails a successful run when cleanup fails", async () => {
    const adapters = makeAdapters({
      selectFreePort: async () => 43_121,
      build: async () => ({ buildId: "cleanup-failure-build" }),
      startServer: async () => ({
        exited: new Promise(() => {}),
        stop: async () => {
          throw new Error("server tree remained alive");
        },
      }),
      waitForBuildIdentity: async () => {},
      runBrowserTests: async () => {},
    });

    await expect(verifyFreshProductionArtifact({}, adapters)).rejects.toMatchObject({
      message: expect.stringContaining("server tree remained alive"),
      phase: "cleanup",
    });
  });

  it("keeps the earlier failure primary while reporting cleanup failure", async () => {
    const diagnostics: ProductionVerificationDiagnostic[] = [];
    const adapters = makeAdapters({
      report: (diagnostic) => diagnostics.push(diagnostic),
      selectFreePort: async () => 43_122,
      build: async () => ({ buildId: "dual-failure-build" }),
      startServer: async () => ({
        exited: new Promise(() => {}),
        stop: async () => {
          throw new Error("cleanup also failed");
        },
      }),
      waitForBuildIdentity: async () => {},
      runBrowserTests: async () => {
        throw new Error("browser failed first");
      },
    });

    await expect(verifyFreshProductionArtifact({}, adapters)).rejects.toMatchObject({
      cleanupFailure: expect.objectContaining({ message: "cleanup also failed" }),
      message: expect.stringContaining("browser failed first"),
      phase: "browser-test",
    });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        phase: "cleanup",
        status: "failed",
      }),
    );
  });

  it("releases the checkout lock after a production-build failure", async () => {
    let lockHeld = false;
    const adapters = makeAdapters({
      acquireLock: async () => {
        lockHeld = true;
        return {
          release: async () => {
            lockHeld = false;
          },
        };
      },
      selectFreePort: async () => 43_126,
      build: async () => {
        throw new Error("build failed");
      },
    });

    await expect(verifyFreshProductionArtifact({}, adapters)).rejects.toMatchObject({
      message: "build failed",
      phase: "production-build",
    });
    expect(lockHeld).toBe(false);
  });

  it.each(["SIGINT", "SIGTERM"])(
    "cleans up the server and lock after %s interruption",
    async (signalName) => {
      const controller = new AbortController();
      let lockHeld = false;
      let serverRunning = false;
      let browserStarted!: () => void;
      const browserIsRunning = new Promise<void>((resolve) => {
        browserStarted = resolve;
      });
      const adapters = makeAdapters({
        acquireLock: async () => {
          lockHeld = true;
          return {
            release: async () => {
              lockHeld = false;
            },
          };
        },
        selectFreePort: async () => 43_127,
        build: async () => ({ buildId: "interrupted-build" }),
        startServer: async () => {
          serverRunning = true;
          return {
            exited: new Promise(() => {}),
            stop: async () => {
              serverRunning = false;
            },
          };
        },
        waitForBuildIdentity: async () => {},
        runBrowserTests: async ({ signal }) => {
          browserStarted();
          await new Promise<never>((_, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(signal.reason),
              { once: true },
            );
          });
        },
      });

      const verification = verifyFreshProductionArtifact(
        { signal: controller.signal },
        adapters,
      );
      await browserIsRunning;
      controller.abort(new Error(`Production verification interrupted by ${signalName}.`));

      await expect(verification).rejects.toMatchObject({
        message: `Production verification interrupted by ${signalName}.`,
        phase: "browser-test",
      });
      expect(serverRunning).toBe(false);
      expect(lockHeld).toBe(false);
    },
  );
});
