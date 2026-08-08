import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readAffectedBrowserVerificationChangedFiles,
  runAffectedBrowserVerificationCommand,
} from "@/scripts/affected-browser-verification";
import { makeProductionVerificationAdapters } from "@/tests/helpers/production-verification";

describe("Affected Browser Verification command", () => {
  it("exposes one supported affected-verification package command", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["verify:affected"]).toBe(
      "tsx scripts/verify-affected.ts",
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
      git("add", "tracked.ts");
      git("commit", "--quiet", "-m", "base");
      git("branch", "base");

      await writeFile(resolve(cwd, "tracked.ts"), "export const value = 2;\n");
      await writeFile(resolve(cwd, "untracked.ts"), "export const added = true;\n");

      await expect(
        readAffectedBrowserVerificationChangedFiles(cwd, "base"),
      ).resolves.toEqual(["tracked.ts", "untracked.ts"]);
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });

  it("selects and explains the required Chromium journey through the owned runner", async () => {
    const output: string[] = [];
    let browserSelection: unknown;
    const adapters = {
      ...makeProductionVerificationAdapters({
        build: async () => ({ buildId: "affected-build" }),
        runBrowserTests: async (input) => {
          browserSelection = input.selection;
        },
        selectFreePort: async () => 43_130,
        startServer: async () => ({
          exited: new Promise(() => {}),
          stop: async () => {},
        }),
        waitForBuildIdentity: async () => {},
      }),
      readChangedFiles: async () => ["components/search/SearchResultCard.tsx"],
    };

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
        "sha256:fec535fcf27647b6183dfb7b34fd6b459f293fce9db3f9d33b444c7df9034545",
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
    const adapters = {
      ...makeProductionVerificationAdapters({
        build: async () => ({ buildId: "combined-build" }),
        runBrowserTests: async (input) => {
          browserSelection = input.selection;
        },
        selectFreePort: async () => 43_131,
        startServer: async () => ({
          exited: new Promise(() => {}),
          stop: async () => {},
        }),
        waitForBuildIdentity: async () => {},
      }),
      readChangedFiles: async () => [
        "components/search/SearchResultCard.tsx",
        "components/home/HomeBackgroundVideo.tsx",
      ],
    };

    await runAffectedBrowserVerificationCommand({
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
  });

  it("fails closed to the complete plan for an unmapped path", async () => {
    const output: string[] = [];
    let browserSelection: unknown;
    const adapters = {
      ...makeProductionVerificationAdapters({
        build: async () => ({ buildId: "fallback-build" }),
        runBrowserTests: async (input) => {
          browserSelection = input.selection;
        },
        selectFreePort: async () => 43_132,
        startServer: async () => ({
          exited: new Promise(() => {}),
          stop: async () => {},
        }),
        waitForBuildIdentity: async () => {},
      }),
      readChangedFiles: async () => ["middleware.ts"],
    };

    await runAffectedBrowserVerificationCommand({
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
  });

  it("adds an explicit capability without removing required journeys", async () => {
    const output: string[] = [];
    let browserSelection: unknown;
    const adapters = {
      ...makeProductionVerificationAdapters({
        build: async () => ({ buildId: "addition-build" }),
        runBrowserTests: async (input) => {
          browserSelection = input.selection;
        },
        selectFreePort: async () => 43_133,
        startServer: async () => ({
          exited: new Promise(() => {}),
          stop: async () => {},
        }),
        waitForBuildIdentity: async () => {},
      }),
      readChangedFiles: async () => ["components/search/SearchResultCard.tsx"],
    };

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

  it("adds an explicit journey while preserving the mapped selection", async () => {
    const output: string[] = [];
    let browserSelection: unknown;
    const adapters = {
      ...makeProductionVerificationAdapters({
        build: async () => ({ buildId: "journey-addition-build" }),
        runBrowserTests: async (input) => {
          browserSelection = input.selection;
        },
        selectFreePort: async () => 43_134,
        startServer: async () => ({
          exited: new Promise(() => {}),
          stop: async () => {},
        }),
        waitForBuildIdentity: async () => {},
      }),
      readChangedFiles: async () => ["components/search/SearchResultCard.tsx"],
    };

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
    const adapters = {
      ...makeProductionVerificationAdapters({
        build: async () => ({ buildId: "capability-build" }),
        runBrowserTests: async (input) => {
          browserSelection = input.selection;
        },
        selectFreePort: async () => 43_135,
        startServer: async () => ({
          exited: new Promise(() => {}),
          stop: async () => {},
        }),
        waitForBuildIdentity: async () => {},
      }),
      readChangedFiles: async () => ["components/search/SearchResultCard.tsx"],
    };

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
    const adapters = {
      ...makeProductionVerificationAdapters({
        build: async () => {
          built = true;
          return { buildId: "must-not-build" };
        },
      }),
      readChangedFiles: async () => ["components/search/SearchResultCard.tsx"],
    };

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
    const adapters = {
      ...makeProductionVerificationAdapters({
        build: async () => ({ buildId: "mapping-build" }),
        runBrowserTests: async () => {},
        selectFreePort: async () => 43_136,
        startServer: async () => ({
          exited: new Promise(() => {}),
          stop: async () => {},
        }),
        waitForBuildIdentity: async () => {},
      }),
      readChangedFiles: async () => [changedFile],
    };

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
