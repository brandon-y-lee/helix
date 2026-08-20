import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
    const findings = auditActiveLegacyNames([
      {
        path: "lib/example.ts",
        content: [formerBrand, formerCookie, formerProgram].join("\n"),
      },
      {
        path: "supabase/migrations/20260819000000_historical_rebrand.sql",
        content: [
          ["Mei", "Pelle"].join("-"),
          ["MEI", "PELLE"].join("_"),
          ["loyal", "ty"].join(""),
        ].join("\n"),
      },
    ]);

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
    const operationLines = Array.from({ length: 90 }, () => "current");
    operationLines[30] = `renamed from ${formerBrand}`;
    operationLines[31] = `active ${formerBrand}`;
    operationLines[88] = `historical URL for ${formerBrand}`;

    expect(
      auditActiveLegacyNames([
        {
          path:
            "docs/adr/0004-complete-the-helix-rebrand-through-coordinated-identifier-migrations.md",
          content: ["# title", "", `historical ${formerBrand}`].join("\n"),
        },
        {
          path: "docs/operations/helix-public-hostname.md",
          content: operationLines.join("\n"),
        },
      ]),
    ).toEqual([
      {
        line: 32,
        path: "docs/operations/helix-public-hostname.md",
        variant: "former-brand",
      },
    ]);
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
        "github:workflow:plan",
      ]),
    );
  });
});
