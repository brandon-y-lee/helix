import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readAffectedBrowserVerificationChangedFiles,
  runAffectedBrowserVerificationCommand,
} from "@/scripts/affected-browser-verification";
import { BROWSER_VERIFICATION_PLAN } from "@/scripts/browser-verification-plan";
import type { NodeProductionVerificationAdapters } from "@/scripts/production-verification";
import { makeProductionVerificationAdapters } from "@/tests/helpers/production-verification";

function makeAffectedAdapters(
  changedFiles: readonly string[],
  overrides: Partial<NodeProductionVerificationAdapters> = {},
) {
  return {
    ...makeProductionVerificationAdapters({
      build: async () => ({ buildId: "affected-build" }),
      runBrowserTests: async () => {},
      selectFreePort: async () => 43_130,
      startServer: async () => ({
        exited: new Promise(() => {}),
        stop: async () => {},
      }),
      waitForBuildIdentity: async () => {},
      readBuildReuseInput: async () => ({
        categories: makeBuildReuseCategories("test"),
        worktreeId: "test-worktree",
      }),
      readReusableBuildReceipt: async () => undefined,
      removeReusableBuildReceipt: async () => {},
      writeReusableBuildReceipt: async () => {},
      ...overrides,
    }),
    readChangedFiles: async () => changedFiles,
  };
}

function makeBuildReuseCategories(suffix = "v1") {
  return {
    "browser-configuration": `browser-${suffix}`,
    dependencies: `dependencies-${suffix}`,
    environment: `environment-${suffix}`,
    "runtime-source": `runtime-${suffix}`,
    tests: `tests-${suffix}`,
    "verification-plan": `plan-${suffix}`,
  };
}

function makeReusableBuildReceipt(
  overrides: {
    buildId?: string;
    worktreeId?: string;
    extra?: Record<string, unknown>;
  } = {},
) {
  return JSON.stringify({
    version: 1,
    buildId: overrides.buildId ?? "old-build",
    worktreeId: overrides.worktreeId ?? "worktree-a",
    categories: makeBuildReuseCategories(),
    ...overrides.extra,
  });
}

describe("Affected Browser Verification command", () => {
  it("exposes one supported affected-verification package command", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["verify:affected"]).toBe(
      "tsx scripts/verify-affected.ts",
    );
    expect(BROWSER_VERIFICATION_PLAN.projects).toEqual([
      { device: "Desktop Chrome", name: "chromium" },
      { device: "Desktop Safari", name: "webkit" },
    ]);
  });

  it("reuses one receipted production build across unchanged supported checks", async () => {
    const output: string[] = [];
    let builds = 0;
    let receipt: { contents: string; modifiedAtMs: number } | undefined;
    const adapters = {
      ...makeAffectedAdapters(["components/search/SearchResultCard.tsx"], {
        build: async () => {
          builds += 1;
          return { buildId: "reusable-build" };
        },
      }),
      readArtifact: async () => ({
        buildId: "reusable-build",
        modifiedAtMs: 100,
      }),
      readBuildReuseInput: async () => ({
        categories: makeBuildReuseCategories(),
        worktreeId: "worktree-a",
      }),
      readReusableBuildReceipt: async () => receipt,
      removeReusableBuildReceipt: async () => {
        receipt = undefined;
      },
      writeReusableBuildReceipt: async (value: unknown) => {
        receipt = { contents: JSON.stringify(value), modifiedAtMs: 101 };
      },
    };

    const first = await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev"],
      env: {},
      log: (message) => output.push(message),
    });
    const second = await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev"],
      env: {},
      log: (message) => output.push(message),
    });

    expect(builds).toBe(1);
    expect(first).toMatchObject({ reuseStatus: "new" });
    expect(second).toMatchObject({ reuseStatus: "reused" });
    expect(output).toContain("Production build reuse: new (no receipt).");
    expect(output).toContain("Production build reuse: reused (inputs match).");
  });

  it.each([
    "runtime-source",
    "dependencies",
    "environment",
    "browser-configuration",
    "verification-plan",
    "tests",
  ] as const)("invalidates reuse when %s changes", async (category) => {
    const output: string[] = [];
    let builds = 0;
    let receipt: { contents: string; modifiedAtMs: number } | undefined;
    const categories = makeBuildReuseCategories();
    const adapters = {
      ...makeAffectedAdapters(["components/search/SearchResultCard.tsx"], {
        build: async () => {
          builds += 1;
          return { buildId: `build-${builds}` };
        },
      }),
      readArtifact: async () => ({
        buildId: "build-1",
        modifiedAtMs: 100,
      }),
      readBuildReuseInput: async () => ({ categories, worktreeId: "worktree-a" }),
      readReusableBuildReceipt: async () => receipt,
      removeReusableBuildReceipt: async () => {
        receipt = undefined;
      },
      writeReusableBuildReceipt: async (value: unknown) => {
        receipt = { contents: JSON.stringify(value), modifiedAtMs: 101 };
      },
    };

    await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev"],
      env: {},
      log: (message) => output.push(message),
    });
    categories[category] = `${category}-v2`;
    const result = await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev"],
      env: {},
      log: (message) => output.push(message),
    });

    expect(builds).toBe(2);
    expect(result).toMatchObject({
      invalidationReason: `${category} changed`,
      reuseStatus: "new",
    });
    expect(output).toContain(
      `Production build reuse: new (${category} changed).`,
    );
  });

  it("emits structured build and browser telemetry for a supported check", async () => {
    const output: string[] = [];
    let elapsed = 0;
    const adapters = makeAffectedAdapters(
      ["components/search/SearchResultCard.tsx"],
      {
        build: async () => {
          elapsed = 120;
          return { buildId: "telemetry-build" };
        },
        now: () => elapsed,
        runBrowserTests: async () => {
          elapsed = 175;
          return { retries: 2 };
        },
        startServer: async () => ({
          exited: new Promise(() => {}),
          stop: async () => {
            elapsed = 180;
          },
        }),
        waitForBuildIdentity: async () => {
          elapsed = 125;
        },
      },
    );

    const result = await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev"],
      env: {},
      log: (message) => output.push(message),
    });

    expect(result.telemetry).toEqual({
      browserTimeMs: 50,
      buildTimeMs: 120,
      capabilities: ["Product Search"],
      journeyCount: 1,
      outcome: "passed",
      projects: ["chromium"],
      retries: 2,
      reuseStatus: "new",
    });
    expect(output).toContain(
      `[affected-verification-result] ${JSON.stringify(result.telemetry)}`,
    );
  });

  it("emits structured failure telemetry without swallowing lifecycle failure", async () => {
    const output: string[] = [];
    let elapsed = 0;
    let stopped = false;
    const adapters = makeAffectedAdapters(
      ["components/search/SearchResultCard.tsx"],
      {
        build: async () => {
          elapsed = 40;
          return { buildId: "failed-telemetry-build" };
        },
        now: () => elapsed,
        runBrowserTests: async () => {
          elapsed = 70;
          const failure = new Error("Browser journey failed.") as Error & {
            retryCount: number;
          };
          failure.retryCount = 2;
          throw failure;
        },
        startServer: async () => ({
          exited: new Promise(() => {}),
          stop: async () => {
            stopped = true;
          },
        }),
        waitForBuildIdentity: async () => {
          elapsed = 50;
        },
      },
    );

    await expect(
      runAffectedBrowserVerificationCommand({
        adapters,
        argv: ["--base", "dev"],
        env: {},
        log: (message) => output.push(message),
      }),
    ).rejects.toMatchObject({
      message: "Browser journey failed.",
      phase: "browser-test",
    });
    expect(stopped).toBe(true);
    expect(output).toContain("Production build reuse: new (no receipt).");
    const structured = output.find((line) =>
      line.startsWith("[affected-verification-result] "),
    );
    expect(
      JSON.parse(structured!.replace("[affected-verification-result] ", "")),
    ).toEqual({
      browserTimeMs: 20,
      buildTimeMs: 40,
      capabilities: ["Product Search"],
      failureClassification: "browser-test",
      journeyCount: 1,
      outcome: "failed",
      projects: ["chromium"],
      retries: 2,
      reuseStatus: "new",
    });
  });

  it("rejects a concurrent supported check while preserving the active owner", async () => {
    const rejectedOutput: string[] = [];
    let owned = false;
    let releaseBrowser!: () => void;
    let markBrowserStarted!: () => void;
    const browserStarted = new Promise<void>((resolveStarted) => {
      markBrowserStarted = resolveStarted;
    });
    const browserGate = new Promise<void>((resolveBrowser) => {
      releaseBrowser = resolveBrowser;
    });
    const adapters = makeAffectedAdapters(
      ["components/search/SearchResultCard.tsx"],
      {
        acquireLock: async () => {
          if (owned) {
            throw new Error("Production verification is already owned.");
          }
          owned = true;
          return {
            release: async () => {
              owned = false;
            },
          };
        },
        runBrowserTests: async () => {
          markBrowserStarted();
          await browserGate;
        },
      },
    );

    const active = runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev"],
      env: {},
      log: () => {},
    });
    await browserStarted;
    await expect(
      runAffectedBrowserVerificationCommand({
        adapters,
        argv: ["--base", "dev"],
        env: {},
        log: (message) => rejectedOutput.push(message),
      }),
    ).rejects.toMatchObject({
      message: "Production verification is already owned.",
      phase: "preflight",
    });
    expect(rejectedOutput).toContain(
      "Production build reuse: new (preflight failed before reuse evaluation).",
    );
    expect(owned).toBe(true);

    releaseBrowser();
    await expect(active).resolves.toMatchObject({ reuseStatus: "new" });
    expect(owned).toBe(false);
  });

  it("removes an unusable receipt and releases ownership after interruption", async () => {
    const controller = new AbortController();
    let buildStarted!: () => void;
    const started = new Promise<void>((resolveStarted) => {
      buildStarted = resolveStarted;
    });
    let receiptRemoved = false;
    let receiptWritten = false;
    let released = false;
    const adapters = makeAffectedAdapters(
      ["components/search/SearchResultCard.tsx"],
      {
        acquireLock: async () => ({
          release: async () => {
            released = true;
          },
        }),
        build: async ({ signal }) => {
          buildStarted();
          await new Promise<void>((_resolve, reject) => {
            signal?.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          });
          return { buildId: "must-not-complete" };
        },
        removeReusableBuildReceipt: async () => {
          receiptRemoved = true;
        },
        writeReusableBuildReceipt: async () => {
          receiptWritten = true;
        },
      },
    );
    const command = runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev"],
      env: {},
      log: () => {},
      signal: controller.signal,
    });
    await started;
    controller.abort(new Error("Verification interrupted by test."));

    await expect(command).rejects.toMatchObject({
      message: "Verification interrupted by test.",
      phase: "production-build",
    });
    expect(receiptRemoved).toBe(true);
    expect(receiptWritten).toBe(false);
    expect(released).toBe(true);
  });

  it("rejects a build whose reuse inputs change before receipt publication", async () => {
    let inputsChanged = false;
    let receiptWritten = false;
    let released = false;
    let serverStarts = 0;
    const categories = makeBuildReuseCategories();
    const adapters = {
      ...makeAffectedAdapters(["components/search/SearchResultCard.tsx"], {
        acquireLock: async () => ({
          release: async () => {
            released = true;
          },
        }),
        build: async () => {
          inputsChanged = true;
          return { buildId: "raced-build" };
        },
        startServer: async () => {
          serverStarts += 1;
          throw new Error("Server must not start for an unstable build.");
        },
      }),
      readBuildReuseInput: async () => ({
        categories: {
          ...categories,
          "runtime-source": inputsChanged ? "runtime-v2" : "runtime-v1",
        },
        worktreeId: "worktree-a",
      }),
      writeReusableBuildReceipt: async () => {
        receiptWritten = true;
      },
    };

    await expect(
      runAffectedBrowserVerificationCommand({
        adapters,
        argv: ["--base", "dev"],
        env: {},
        log: () => {},
      }),
    ).rejects.toMatchObject({
      message: "Production build inputs changed while the build was running.",
      phase: "production-build",
    });
    expect(receiptWritten).toBe(false);
    expect(serverStarts).toBe(0);
    expect(released).toBe(true);
  });

  it.each([
    ["malformed", "{not-json", 101, "receipt malformed"],
    [
      "partially written",
      '{"version":1,"buildId":"old-build"',
      101,
      "receipt malformed",
    ],
    [
      "receipt containing an unexpected field",
      makeReusableBuildReceipt({
        extra: { secret: "must-not-be-accepted" },
      }),
      101,
      "receipt malformed",
    ],
    [
      "stale",
      makeReusableBuildReceipt(),
      99,
      "receipt stale",
    ],
    [
      "substituted artifact",
      makeReusableBuildReceipt({ buildId: "other-build" }),
      101,
      "artifact identity changed",
    ],
    [
      "cross-worktree",
      makeReusableBuildReceipt({ worktreeId: "worktree-b" }),
      101,
      "worktree identity changed",
    ],
  ])("fails closed and rebuilds for a %s receipt", async (
    _name,
    contents,
    modifiedAtMs,
    expectedReason,
  ) => {
    const output: string[] = [];
    let builds = 0;
    let provenBuildId: string | undefined;
    const adapters = {
      ...makeAffectedAdapters(["components/search/SearchResultCard.tsx"], {
        build: async () => {
          builds += 1;
          return { buildId: "rebuilt-build" };
        },
        waitForBuildIdentity: async ({ buildId }) => {
          provenBuildId = buildId;
        },
      }),
      readArtifact: async () => ({ buildId: "old-build", modifiedAtMs: 100 }),
      readBuildReuseInput: async () => ({
        categories: makeBuildReuseCategories(),
        worktreeId: "worktree-a",
      }),
      readReusableBuildReceipt: async () => ({ contents, modifiedAtMs }),
    };

    const result = await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev"],
      env: {},
      log: (message) => output.push(message),
    });

    expect(builds).toBe(1);
    expect(provenBuildId).toBe("rebuilt-build");
    expect(result).toMatchObject({
      invalidationReason: expectedReason,
      reuseStatus: "new",
    });
    expect(output).toContain(
      `Production build reuse: new (${expectedReason}).`,
    );
  });

  it("compares the complete candidate worktree with the pull-request merge base", async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), "mei-pelle-affected-git-"));
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd, encoding: "utf8" });

    try {
      git("init", "--quiet", "--initial-branch=dev");
      git("config", "user.email", "tests@example.test");
      git("config", "user.name", "Mei Pelle Tests");
      await writeFile(resolve(cwd, "tracked.ts"), "export const value = 1;\n");
      await writeFile(resolve(cwd, "deleted.ts"), "export const gone = true;\n");
      git("add", "tracked.ts", "deleted.ts");
      git("commit", "--quiet", "-m", "base");
      git("branch", "base");

      await writeFile(resolve(cwd, "tracked.ts"), "export const value = 2;\n");
      await writeFile(resolve(cwd, "untracked.ts"), "export const added = true;\n");
      await unlink(resolve(cwd, "deleted.ts"));

      await expect(
        readAffectedBrowserVerificationChangedFiles(cwd, "base"),
      ).resolves.toEqual(["deleted.ts", "tracked.ts", "untracked.ts"]);
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });

  it("selects and explains the required Chromium journey through the owned runner", async () => {
    const output: string[] = [];
    let browserSelection: unknown;
    const adapters = makeAffectedAdapters(
      ["components/search/SearchResultCard.tsx"],
      {
        runBrowserTests: async (input) => {
          browserSelection = input.selection;
        },
      },
    );

    await expect(
      runAffectedBrowserVerificationCommand({
        adapters,
        argv: ["--", "--base", "dev"],
        env: {},
        log: (message) => output.push(message),
      }),
    ).resolves.toMatchObject({
      baseRef: "dev",
      buildId: "affected-build",
      fingerprint:
        "sha256:e44a47aabf3ef00f15950dd0e3ac8498e7b3368e8c509319ac79a1fd9e0a774c",
    });

    expect(browserSelection).toEqual({
      journeyIds: ["header-search"],
      projects: ["chromium"],
    });
    expect(output).toContain(
      "Selected chromium / header-search: components/search/SearchResultCard.tsx maps to Product Search.",
    );
  });

  it("combines mapped capabilities and adds WebKit for browser-sensitive work", async () => {
    let browserSelection: unknown;
    const adapters = makeAffectedAdapters(
      [
        "components/search/SearchResultCard.tsx",
        "components/home/HomeBackgroundVideo.tsx",
      ],
      {
        build: async () => ({ buildId: "combined-build" }),
        runBrowserTests: async (input) => {
          browserSelection = input.selection;
        },
      },
    );

    const result = await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev"],
      env: {},
      log: () => {},
    });

    expect(browserSelection).toEqual({
      journeyIds: [
        "header-search",
        "homepage-hero",
        "storefront-purchase",
      ],
      projects: ["chromium", "webkit"],
      webkitJourneyIds: ["homepage-hero", "storefront-purchase"],
    });
    expect(result.telemetry).toMatchObject({
      journeyCount: 5,
      projects: ["chromium", "webkit"],
    });
  });

  it("fails closed to the complete plan for an unmapped path", async () => {
    const output: string[] = [];
    let browserSelection: unknown;
    const adapters = makeAffectedAdapters(["middleware.ts"], {
      build: async () => ({ buildId: "fallback-build" }),
      runBrowserTests: async (input) => {
        browserSelection = input.selection;
      },
    });

    const result = await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev"],
      env: {},
      log: (message) => output.push(message),
    });

    expect(browserSelection).toEqual({
      journeyIds: [
        "catalog-preview",
        "product-discovery",
        "editorial-navigation",
        "footer-support",
        "homepage-hero",
        "header-navigation",
        "routine-selector",
        "header-search",
        "storefront-purchase",
      ],
      projects: ["chromium", "webkit"],
      webkitJourneyIds: [
        "catalog-preview",
        "product-discovery",
        "editorial-navigation",
        "footer-support",
        "homepage-hero",
        "header-navigation",
        "routine-selector",
        "header-search",
        "storefront-purchase",
      ],
    });
    expect(output).toContain(
      "Selected webkit / storefront-purchase: middleware.ts is not mapped by Browser Verification Plan v1; selected the complete plan.",
    );
    expect(result.telemetry.capabilities).toEqual([
      "Catalog Preview",
      "Platform Navigation",
      "Product Discovery",
      "Accessibility Interaction",
      "Focus",
      "Media",
      "Responsive Overlay",
      "Scroll",
      "Routine Navigation",
      "Product Search",
      "PDP Purchase",
      "Cart",
      "Touch",
      "Sticky Layout",
    ]);
  });

  it("does not classify a file whose name only extends an exact path rule", async () => {
    const output: string[] = [];
    let browserSelection: unknown;
    const adapters = makeAffectedAdapters(
      ["components/shell/Header.tsx.backup"],
      {
        runBrowserTests: async (input) => {
          browserSelection = input.selection;
        },
      },
    );

    await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev"],
      env: {},
      log: (message) => output.push(message),
    });

    expect(browserSelection).toMatchObject({
      projects: ["chromium", "webkit"],
      webkitJourneyIds: BROWSER_VERIFICATION_PLAN.journeys.map(
        ({ id }) => id,
      ),
    });
    expect(output).toContain(
      "Selected webkit / header-search: components/shell/Header.tsx.backup is not mapped by Browser Verification Plan v1; selected the complete plan.",
    );
  });

  it("adds an explicit capability without removing required journeys", async () => {
    const output: string[] = [];
    let browserSelection: unknown;
    const adapters = makeAffectedAdapters(
      ["components/search/SearchResultCard.tsx"],
      {
        build: async () => ({ buildId: "addition-build" }),
        runBrowserTests: async (input) => {
          browserSelection = input.selection;
        },
      },
    );

    await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev", "--add-capability", "Touch"],
      env: {},
      log: (message) => output.push(message),
    });

    expect(browserSelection).toEqual({
      journeyIds: ["header-search", "storefront-purchase"],
      projects: ["chromium", "webkit"],
      webkitJourneyIds: ["storefront-purchase"],
    });
    expect(output).toContain(
      "Selected webkit / storefront-purchase: explicit capability Touch was added by the caller.",
    );
  });

  it("adds WebKit protection when an explicit sensitive capability reselects a mapped journey", async () => {
    const output: string[] = [];
    let browserSelection: unknown;
    const adapters = makeAffectedAdapters(
      ["components/search/SearchResultCard.tsx"],
      {
        build: async () => ({ buildId: "sensitive-addition-build" }),
        runBrowserTests: async (input) => {
          browserSelection = input.selection;
        },
      },
    );

    await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev", "--add-capability", "Focus"],
      env: {},
      log: (message) => output.push(message),
    });

    expect(browserSelection).toEqual({
      journeyIds: [
        "header-search",
        "product-discovery",
        "editorial-navigation",
        "header-navigation",
        "routine-selector",
        "storefront-purchase",
      ],
      projects: ["chromium", "webkit"],
      webkitJourneyIds: [
        "header-search",
        "product-discovery",
        "editorial-navigation",
        "header-navigation",
        "routine-selector",
        "storefront-purchase",
      ],
    });
    expect(output).toContain(
      "Selected webkit / header-search: components/search/SearchResultCard.tsx maps to Product Search; explicit capability Focus was added by the caller.",
    );
  });

  it("adds an explicit journey while preserving the mapped selection", async () => {
    const output: string[] = [];
    let browserSelection: unknown;
    const adapters = makeAffectedAdapters(
      ["components/search/SearchResultCard.tsx"],
      {
        build: async () => ({ buildId: "journey-addition-build" }),
        runBrowserTests: async (input) => {
          browserSelection = input.selection;
        },
      },
    );

    await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev", "--add-journey", "footer-support"],
      env: {},
      log: (message) => output.push(message),
    });

    expect(browserSelection).toEqual({
      journeyIds: ["header-search", "footer-support"],
      projects: ["chromium"],
    });
    expect(output).toContain(
      "Selected chromium / footer-support: explicit journey footer-support was added by the caller.",
    );
  });

  it.each([
    ["Catalog Preview", "catalog-preview"],
    ["Product Discovery", "product-discovery"],
    ["Platform Navigation", "editorial-navigation"],
    ["Accessibility Interaction", "editorial-navigation"],
    ["Focus", "editorial-navigation"],
    ["Scroll", "header-navigation"],
    ["Responsive Overlay", "header-navigation"],
    ["Routine Navigation", "routine-selector"],
    ["PDP Purchase", "storefront-purchase"],
    ["Cart", "storefront-purchase"],
    ["Sticky Layout", "storefront-purchase"],
  ])("supports the %s capability", async (capability, expectedJourney) => {
    const output: string[] = [];
    let browserSelection:
      | { journeyIds: readonly string[] }
      | undefined;
    const adapters = makeAffectedAdapters(
      ["components/search/SearchResultCard.tsx"],
      {
        build: async () => ({ buildId: "capability-build" }),
        runBrowserTests: async (input) => {
          browserSelection = input.selection;
        },
      },
    );

    await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev", "--add-capability", capability],
      env: {},
      log: (message) => output.push(message),
    });

    expect(browserSelection?.journeyIds).toContain(expectedJourney);
    expect(output.some((line) => line.includes(
      `explicit capability ${capability} was added by the caller.`,
    ))).toBe(true);
  });

  it("rejects attempts to subtract a required journey before building", async () => {
    let built = false;
    const adapters = makeAffectedAdapters(
      ["components/search/SearchResultCard.tsx"],
      {
        build: async () => {
          built = true;
          return { buildId: "must-not-build" };
        },
      },
    );

    await expect(
      runAffectedBrowserVerificationCommand({
        adapters,
        argv: ["--base", "dev", "--exclude-journey", "header-search"],
        env: {},
        log: () => {},
      }),
    ).rejects.toThrow('Unsupported affected-verification option "--exclude-journey".');
    expect(built).toBe(false);
  });

  it.each([
    ["components/admin/CatalogPreviewToolbar.tsx", "Catalog Preview"],
    ["components/home/HomeCoreShowcase.tsx", "Product Discovery"],
    ["app/about/page.tsx", "Platform Navigation"],
    ["app/accessibility/page.tsx", "Accessibility Interaction"],
    ["components/overlays/Sheet.tsx", "Focus"],
    ["components/home/HomeBackgroundVideo.tsx", "Media"],
    ["components/home/useScrollDirectionZoom.ts", "Scroll"],
    ["components/shell/Header.tsx", "Responsive Overlay"],
    ["components/system/MethodRoutineNav.tsx", "Routine Navigation"],
    ["components/search/SearchOverlay.tsx", "Product Search"],
    ["components/product-detail/PdpPurchaseIsland.tsx", "PDP Purchase"],
    ["components/cart/CartProvider.tsx", "Cart"],
    ["components/product/ShopBrowser.tsx", "Touch"],
    ["components/product-detail/PdpRoutineVideo.tsx", "Sticky Layout"],
  ])("maps changed paths to %s", async (changedFile, capability) => {
    const output: string[] = [];
    const adapters = makeAffectedAdapters([changedFile], {
      build: async () => ({ buildId: "mapping-build" }),
    });

    await runAffectedBrowserVerificationCommand({
      adapters,
      argv: ["--base", "dev"],
      env: {},
      log: (message) => output.push(message),
    });

    expect(output.some((line) => line.includes(
      `${changedFile} maps to ${capability}.`,
    ))).toBe(true);
  });
});
