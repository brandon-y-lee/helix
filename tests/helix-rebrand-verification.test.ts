import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
  HELIX_REBRAND_CHECKS,
  HELIX_REBRAND_VERIFICATION_CATEGORIES,
  auditActiveLegacyNames,
  runHelixRebrandChecks,
} from "@/scripts/helix-rebrand-verification";

describe("Helix Rebrand Verification", () => {
  it("flags active legacy variants while allowing applied migration history", () => {
    const formerBrand = ["Mei", "Pelle"].join(" ");
    const formerCookie = ["mei", "pelle", "cart"].join("_");
    const formerProgram = ["loyal", "ty_balance"].join("");
    const migrationPath =
      "supabase/migrations/20260819000000_historical_rebrand.sql";
    const findings = auditActiveLegacyNames([
      {
        path: "lib/example.ts",
        content: [formerBrand, formerCookie, formerProgram].join("\n"),
      },
      {
        path: migrationPath,
        content: [
          ["Mei", "Pelle"].join("-"),
          ["MEI", "PELLE"].join("_"),
          ["loyal", "ty"].join(""),
        ].join("\n"),
      },
    ], new Set([migrationPath]));

    expect(findings).toEqual([
      {
        line: 1,
        path: "lib/example.ts",
        variant: "former-brand",
      },
      {
        line: 2,
        path: "lib/example.ts",
        variant: "former-brand",
      },
      {
        line: 3,
        path: "lib/example.ts",
        variant: "legacy-rewards-language",
      },
    ]);
  });

  it("flags concatenated and camel-case former brand identifiers", () => {
    const concatenated = ["mei", "pelle"].join("");
    const camelCase = `${["mei", "Pelle"].join("")}Cart`;

    expect(
      auditActiveLegacyNames([
        { path: "lib/concatenated.ts", content: concatenated },
        { path: "lib/camel.ts", content: camelCase },
      ]),
    ).toEqual([
      { line: 1, path: "lib/concatenated.ts", variant: "former-brand" },
      { line: 1, path: "lib/camel.ts", variant: "former-brand" },
    ]);
  });

  it("audits legacy names in paths and permits only named historical records", () => {
    const oldPath = ["public/media/home/mei", "pelle-hero.webp"].join("-");
    const formerBrand = ["Mei", "Pelle"].join(" ");

    expect(
      auditActiveLegacyNames([
        { path: oldPath, content: "binary" },
        {
          path: "docs/domain/brand-platform/CONTEXT.md",
          content: `_Avoid_: ${formerBrand}`,
        },
        {
          path: "docs/current-operation.md",
          content: `The active service is ${formerBrand}.`,
        },
      ]),
    ).toEqual([
      { line: 0, path: oldPath, variant: "former-brand" },
      {
        line: 1,
        path: "docs/current-operation.md",
        variant: "former-brand",
      },
    ]);
  });

  it("allows only the exact immutable ADR and provider-history lines", () => {
    const formerBrand = ["Mei", "Pelle"].join(" ");
    const operationLines = [
      `GitHub repository was renamed in place from \`brandon-y-lee/${["mei", "pelle"].join("-")}\` to`,
      `active ${formerBrand}`,
      `\`https://${["mei", "pelle"].join("-")}.vercel.app/api/webhooks/supabase/catalog-search-sync\``,
    ];

    expect(
      auditActiveLegacyNames([
        {
          path:
            "docs/adr/0004-complete-the-helix-rebrand-through-coordinated-identifier-migrations.md",
          content: [
            "# Complete the helix rebrand through coordinated identifier migrations",
            "",
            `The helix rebrand will finish without active ${formerBrand} names in application code, tests, configuration, current database objects or data, or remote resources, without application-managed legacy compatibility, and with active Rewards & Referrals identifiers using rewards language instead of ${["loyal", "ty"].join("")} language. Resources that cannot be renamed in place will use a temporary create, copy, switch, verify, and delete sequence; the temporary bridge must be removed before the rebrand is complete. Applied migration files, immutable real audit history, opaque provider-assigned identifiers, and provider-managed redirects remain intact because they are historical or external identity rather than active brand compatibility.`,
          ].join("\n"),
        },
        {
          path: "docs/operations/helix-public-hostname.md",
          content: operationLines.join("\n"),
        },
      ]),
    ).toEqual([
      {
        line: 2,
        path: "docs/operations/helix-public-hostname.md",
        variant: "former-brand",
      },
    ]);
  });

  it("allows verified immutable research only while its full content is unchanged", () => {
    const formerBrand = ["Mei", "Pelle"].join(" ");
    const preservedPath = "docs/research/preserved-decision.md";
    const changedPath = "docs/research/changed-decision.md";
    const preservedContent = `# Historical research\n\n${formerBrand} launch decision.`;
    const changedContent = `${preservedContent}\n\nNew active ${formerBrand} instruction.`;

    expect(
      auditActiveLegacyNames(
        [
          { path: preservedPath, content: preservedContent },
          { path: changedPath, content: changedContent },
        ],
        new Set(),
        new Map([
          [preservedPath, preservedContent],
          [changedPath, preservedContent],
        ]),
      ),
    ).toEqual([
      { line: 3, path: changedPath, variant: "former-brand" },
      { line: 5, path: changedPath, variant: "former-brand" },
    ]);
  });

  it("verifies pinned research from origin/dev and fails closed when a blob changes", () => {
    const projectRoot = process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "helix-rebrand-history-"));
    const root = join(tempRoot, "repo");
    const remote = join(tempRoot, "remote.git");
    const researchPaths = [
      "docs/research/core-protect-formulation-portfolios.md",
      "docs/research/leaders-active-pad-options.md",
      "docs/research/leaders-catalog-evidence.md",
      "docs/research/product-name-launch-risks.md",
    ];
    const runGit = (...args: string[]) =>
      spawnSync("git", args, { cwd: root, encoding: "utf8" });
    const expectGitSuccess = (...args: string[]) => {
      const result = runGit(...args);
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    };
    const tsxLoader = createRequire(import.meta.url).resolve("tsx");
    const runAudit = () =>
      spawnSync(
        process.execPath,
        [
          "--import",
          tsxLoader,
          resolve(projectRoot, "scripts/verify-helix-rebrand.ts"),
          "--audit-only",
        ],
        { cwd: root, encoding: "utf8" },
      );

    try {
      mkdirSync(root);
      expectGitSuccess("init", "-b", "main");
      expectGitSuccess("config", "user.name", "Rebrand History Test");
      expectGitSuccess("config", "user.email", "history@example.test");
      for (const researchPath of researchPaths) {
        const target = join(root, researchPath);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, readFileSync(resolve(projectRoot, researchPath)));
      }
      expectGitSuccess("add", "docs/research");
      expectGitSuccess("commit", "-m", "Preserve immutable research");
      expectGitSuccess("branch", "dev");
      expectGitSuccess("init", "--bare", remote);
      expectGitSuccess("remote", "add", "origin", remote);
      expectGitSuccess("push", "origin", "main", "dev");

      const matching = runAudit();
      expect(matching.status, `${matching.stdout}\n${matching.stderr}`).toBe(0);
      expect(matching.stdout).toContain('"ok": true');

      expectGitSuccess("switch", "dev");
      const changedPath = join(root, researchPaths[0]);
      writeFileSync(
        changedPath,
        `${readFileSync(changedPath, "utf8")}\nRetired research changed.\n`,
      );
      expectGitSuccess("add", researchPaths[0]);
      expectGitSuccess("commit", "-m", "Change retired research");
      expectGitSuccess("push", "origin", "dev");

      const mismatched = runAudit();
      expect(mismatched.status).not.toBe(0);
      expect(mismatched.stdout).toContain(
        `Immutable research history changed at ${researchPaths[0]}`,
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports each verification category distinctly and continues after failure", async () => {
    const checks = HELIX_REBRAND_VERIFICATION_CATEGORIES.map((category) => ({
      category,
      label: `${category} check`,
    }));
    const execute = vi.fn(async (check: (typeof checks)[number]) => {
      if (check.category === "accessibility") {
        throw new Error("focus restoration failed");
      }
    });

    const report = await runHelixRebrandChecks(checks, execute);

    expect(execute).toHaveBeenCalledTimes(checks.length);
    expect(report.ok).toBe(false);
    expect(report.results).toEqual([
      { category: "brand-rendering", label: "brand-rendering check", ok: true },
      {
        category: "accessibility",
        error: "focus restoration failed",
        label: "accessibility check",
        ok: false,
      },
      {
        category: "active-legacy-names",
        label: "active-legacy-names check",
        ok: true,
      },
      {
        category: "renamed-resources",
        label: "renamed-resources check",
        ok: true,
      },
      {
        category: "affected-journeys",
        label: "affected-journeys check",
        ok: true,
      },
    ]);
  });

  it("composes the existing focused local, browser, and provider checks", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const commandNames = HELIX_REBRAND_CHECKS.flatMap((check) =>
      check.kind === "command" ? [check.args[0]] : [],
    );

    expect(packageJson.scripts["verify:helix-rebrand"]).toBe(
      "tsx scripts/verify-helix-rebrand.ts",
    );
    expect(packageJson.scripts["github:rebrand:verify"]).toBe(
      "node scripts/github/verify-helix-repository.mjs --repo brandon-y-lee/helix --candidate-ref HEAD",
    );
    expect(new Set(HELIX_REBRAND_CHECKS.map(({ category }) => category))).toEqual(
      new Set(HELIX_REBRAND_VERIFICATION_CATEGORIES),
    );
    expect(commandNames).toEqual(
      expect.arrayContaining([
        "verify:production",
        "verify:product-media",
        "product:search:verify",
        "catalog:webhooks:verify",
        "stripe:sandbox:verify",
        "github:rebrand:verify",
        "vercel:helix:verify",
      ]),
    );
  });
});
