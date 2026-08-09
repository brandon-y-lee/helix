import { describe, expect, it } from "vitest";
import {
  buildReceiptedProductionArtifact,
  prepareProductionVerificationEnvironment,
  ProductionVerificationChildError,
  ProductionVerificationCleanupError,
  ProductionVerificationError,
  verifyFreshProductionArtifact,
  verifyReceiptedProductionArtifact,
  type ProductionVerificationDiagnostic,
} from "@/scripts/production-verification";
import { makeProductionVerificationAdapters as makeAdapters } from "@/tests/helpers/production-verification";

describe("Production Artifact Verification", () => {
  it("builds one CI artifact and writes its minimal receipt", async () => {
    const commitSha = "a".repeat(40);
    const diagnostics: ProductionVerificationDiagnostic[] = [];
    let released = false;
    let previousReceiptRemoved = false;
    let writtenReceipt: unknown;
    const adapters = makeAdapters({
      acquireLock: async () => ({
        release: async () => {
          released = true;
        },
      }),
      build: async () => {
        expect(previousReceiptRemoved).toBe(true);
        return { buildId: "ci-build-123" };
      },
      readCommitSha: async () => commitSha,
      removeReceipt: async () => {
        previousReceiptRemoved = true;
      },
      report: (diagnostic) => diagnostics.push(diagnostic),
      writeReceipt: async (receipt) => {
        writtenReceipt = receipt;
      },
    });

    await expect(
      buildReceiptedProductionArtifact({}, adapters),
    ).resolves.toEqual({ buildId: "ci-build-123", commitSha });
    expect(writtenReceipt).toEqual({ buildId: "ci-build-123", commitSha });
    expect(Object.keys(writtenReceipt as object)).toEqual(["buildId", "commitSha"]);
    expect(released).toBe(true);
    expect(diagnostics.map(({ phase, status }) => ({ phase, status }))).toEqual([
      { phase: "preflight", status: "started" },
      { phase: "preflight", status: "passed" },
      { phase: "production-build", status: "started" },
      { phase: "production-build", status: "passed" },
      { phase: "cleanup", status: "started" },
      { phase: "cleanup", status: "passed" },
    ]);
  });

  it("keeps a receipted build failure primary when owned cleanup also fails", async () => {
    const diagnostics: ProductionVerificationDiagnostic[] = [];
    const buildFailure = new ProductionVerificationChildError(
      "Production build failed after exit code 17.",
      "exit code 17",
    );
    buildFailure.cleanupFailure = new Error("Owned build tree cleanup failed.");
    const adapters = makeAdapters({
      build: async () => {
        throw buildFailure;
      },
      report: (diagnostic) => diagnostics.push(diagnostic),
    });

    const failure = await buildReceiptedProductionArtifact({}, adapters).catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({
      childExitReason: "exit code 17",
      message: "Production build failed after exit code 17.",
      phase: "production-build",
    });
    expect((failure as ProductionVerificationError).cleanupFailure?.message).toBe(
      "Owned build tree cleanup failed.",
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        childExitReason: "exit code 17",
        phase: "production-build",
        status: "failed",
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ phase: "cleanup", status: "failed" }),
    );
  });

  it("classifies cleanup-only receipted build failures as cleanup failures", async () => {
    const diagnostics: ProductionVerificationDiagnostic[] = [];
    const cleanupFailure = new Error("Owned build tree remained alive.");
    const adapters = makeAdapters({
      build: async () => {
        throw new ProductionVerificationCleanupError(
          cleanupFailure.message,
          cleanupFailure,
        );
      },
      report: (diagnostic) => diagnostics.push(diagnostic),
    });

    await expect(
      buildReceiptedProductionArtifact({}, adapters),
    ).rejects.toMatchObject({
      cleanupFailure,
      message: cleanupFailure.message,
      phase: "cleanup",
    });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ phase: "production-build", status: "passed" }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ phase: "cleanup", status: "failed" }),
    );
  });

  it("keeps lock acquisition failure primary while reporting its cleanup failure", async () => {
    const diagnostics: ProductionVerificationDiagnostic[] = [];
    const acquisitionFailure = new ProductionVerificationError(
      "preflight",
      "Checkout lock acquisition failed.",
    );
    acquisitionFailure.cleanupFailure = new Error(
      "Partial checkout lock cleanup failed.",
    );
    const adapters = makeAdapters({
      acquireLock: async () => {
        throw acquisitionFailure;
      },
      report: (diagnostic) => diagnostics.push(diagnostic),
    });

    await expect(
      buildReceiptedProductionArtifact({}, adapters),
    ).rejects.toMatchObject({
      cleanupFailure: expect.objectContaining({
        message: "Partial checkout lock cleanup failed.",
      }),
      message: "Checkout lock acquisition failed.",
      phase: "preflight",
    });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ phase: "preflight", status: "failed" }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ phase: "cleanup", status: "failed" }),
    );
  });

  it("verifies the receipted CI artifact without rebuilding it", async () => {
    const commitSha = "b".repeat(40);
    let browserRuns = 0;
    let identityProven = false;
    let running = false;
    const diagnostics: ProductionVerificationDiagnostic[] = [];
    const adapters = makeAdapters({
      selectFreePort: async () => 43_121,
      readArtifact: async () => ({
        buildId: "receipted-build",
        modifiedAtMs: 100,
      }),
      readCommitSha: async () => commitSha,
      readReceipt: async () => ({
        contents: JSON.stringify({ buildId: "receipted-build", commitSha }),
        modifiedAtMs: 101,
      }),
      report: (diagnostic) => diagnostics.push(diagnostic),
      startServer: async () => {
        running = true;
        return {
          exited: new Promise(() => {}),
          stop: async () => {
            running = false;
          },
        };
      },
      waitForBuildIdentity: async ({ buildId }) => {
        expect(buildId).toBe("receipted-build");
        identityProven = true;
      },
      runBrowserTests: async () => {
        expect(identityProven).toBe(true);
        browserRuns += 1;
      },
    });

    await expect(
      verifyReceiptedProductionArtifact({}, adapters),
    ).resolves.toEqual({
      baseURL: "http://127.0.0.1:43121",
      buildId: "receipted-build",
      port: 43_121,
    });
    expect(browserRuns).toBe(1);
    expect(running).toBe(false);
    expect(diagnostics.map(({ phase, status }) => ({ phase, status }))).toContainEqual({
      phase: "artifact-validation",
      status: "passed",
    });
  });

  it.each([
    {
      name: "missing",
      receipt: undefined,
      expectedMessage: "Production artifact receipt is missing.",
    },
    {
      name: "malformed",
      receipt: { contents: "{not-json", modifiedAtMs: 101 },
      expectedMessage: "Production artifact receipt is malformed.",
    },
    {
      name: "containing unexpected fields",
      receipt: {
        contents: JSON.stringify({
          buildId: "current-build",
          commitSha: "c".repeat(40),
          environment: "must-not-be-receipted",
        }),
        modifiedAtMs: 101,
      },
      expectedMessage: "Production artifact receipt is malformed.",
    },
    {
      name: "stale",
      receipt: {
        contents: JSON.stringify({
          buildId: "current-build",
          commitSha: "c".repeat(40),
        }),
        modifiedAtMs: 99,
      },
      expectedMessage: "Production artifact receipt is stale.",
    },
    {
      name: "for a substituted build",
      receipt: {
        contents: JSON.stringify({
          buildId: "other-build",
          commitSha: "c".repeat(40),
        }),
        modifiedAtMs: 101,
      },
      expectedMessage:
        "Production artifact receipt build ID does not match the current artifact.",
    },
    {
      name: "for another commit",
      receipt: {
        contents: JSON.stringify({
          buildId: "current-build",
          commitSha: "d".repeat(40),
        }),
        modifiedAtMs: 101,
      },
      expectedMessage:
        "Production artifact receipt commit SHA does not match the current checkout.",
    },
  ])("rejects a $name receipt before server start", async ({
    receipt,
    expectedMessage,
  }) => {
    const diagnostics: ProductionVerificationDiagnostic[] = [];
    let serverStarts = 0;
    const adapters = makeAdapters({
      selectFreePort: async () => 43_122,
      readArtifact: async () => ({
        buildId: "current-build",
        modifiedAtMs: 100,
      }),
      readCommitSha: async () => "c".repeat(40),
      readReceipt: async () => receipt,
      report: (diagnostic) => diagnostics.push(diagnostic),
      startServer: async () => {
        serverStarts += 1;
        throw new Error("Server must not start for an invalid receipt.");
      },
    });

    await expect(
      verifyReceiptedProductionArtifact({}, adapters),
    ).rejects.toMatchObject({
      message: expectedMessage,
      phase: "artifact-validation",
    });
    expect(serverStarts).toBe(0);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ phase: "artifact-validation", status: "failed" }),
    );
  });

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

  it("keeps a child failure primary when its owned-tree cleanup also fails", async () => {
    const diagnostics: ProductionVerificationDiagnostic[] = [];
    const childFailure = new ProductionVerificationChildError(
      "build child failed after exit code 9",
      "exit code 9",
    );
    childFailure.cleanupFailure = new Error("build child cleanup failed");
    const adapters = makeAdapters({
      report: (diagnostic) => diagnostics.push(diagnostic),
      selectFreePort: async () => 43_128,
      build: async () => {
        throw childFailure;
      },
    });

    await expect(verifyFreshProductionArtifact({}, adapters)).rejects.toMatchObject({
      cleanupFailure: expect.objectContaining({
        message: "build child cleanup failed",
      }),
      message: "build child failed after exit code 9",
      phase: "production-build",
    });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ phase: "cleanup", status: "failed" }),
    );
  });

  it("classifies cleanup-only child failures as cleanup failures", async () => {
    const diagnostics: ProductionVerificationDiagnostic[] = [];
    const cleanupFailure = new Error("successful child left a process alive");
    const adapters = makeAdapters({
      report: (diagnostic) => diagnostics.push(diagnostic),
      selectFreePort: async () => 43_129,
      build: async () => {
        throw new ProductionVerificationCleanupError(
          "Production build cleanup failed",
          cleanupFailure,
        );
      },
    });

    await expect(verifyFreshProductionArtifact({}, adapters)).rejects.toMatchObject({
      cleanupFailure: expect.objectContaining({
        message: "successful child left a process alive",
      }),
      message: "Production build cleanup failed",
      phase: "cleanup",
    });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ phase: "production-build", status: "passed" }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ phase: "cleanup", status: "failed" }),
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
