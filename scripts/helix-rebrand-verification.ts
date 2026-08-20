export type LegacyNameVariant =
  | "former-brand"
  | "legacy-rewards-language";

export type LegacyNameFinding = Readonly<{
  path: string;
  line: number;
  variant: LegacyNameVariant;
}>;

export type AuditedFile = Readonly<{
  path: string;
  content: string;
}>;

export const HELIX_REBRAND_VERIFICATION_CATEGORIES = [
  "brand-rendering",
  "accessibility",
  "active-legacy-names",
  "renamed-resources",
  "affected-journeys",
] as const;

export type HelixRebrandVerificationCategory =
  (typeof HELIX_REBRAND_VERIFICATION_CATEGORIES)[number];

export type HelixRebrandCheck = Readonly<{
  category: HelixRebrandVerificationCategory;
  label: string;
}>;

export type HelixRebrandCommandCheck = HelixRebrandCheck &
  Readonly<{
    kind: "command";
    args: readonly [string, ...string[]];
    scope: "local" | "remote";
  }>;

export type HelixRebrandStaticAuditCheck = HelixRebrandCheck &
  Readonly<{
    kind: "static-audit";
    scope: "local";
  }>;

export type HelixRebrandExecutableCheck =
  | HelixRebrandCommandCheck
  | HelixRebrandStaticAuditCheck;

export type HelixRebrandCheckResult = HelixRebrandCheck &
  Readonly<
    | { ok: true }
    | {
        ok: false;
        error: string;
      }
  >;

const APPLIED_MIGRATION_PATH =
  /^supabase\/migrations\/\d{12,14}_[a-z0-9_]+\.sql$/;
const FORMER_BRAND_PATTERN = new RegExp(
  ["mei", "pelle"].join("[\\s_-]+"),
  "i",
);
const LEGACY_REWARDS_PATTERN = new RegExp(
  ["loyal", "ty"].join(""),
  "i",
);

export const HELIX_REBRAND_CHECKS = [
  {
    category: "brand-rendering",
    label: "shared identity and rendered brand surfaces",
    kind: "command",
    scope: "local",
    args: [
      "vitest",
      "run",
      "tests/helix-identity.test.tsx",
      "tests/public-site-helix-rebrand.test.ts",
      "tests/admin-identity-fallbacks.test.tsx",
      "tests/footer-wordmark.test.tsx",
      "tests/product-identity.test.ts",
      "tests/editorial-content.test.tsx",
    ],
  },
  {
    category: "accessibility",
    label: "accessible names, focus, overlays, and reduced motion",
    kind: "command",
    scope: "local",
    args: [
      "vitest",
      "run",
      "tests/admin-shell.test.tsx",
      "tests/footer-support.test.tsx",
      "tests/search-overlay.test.tsx",
      "tests/cart-drawer.test.tsx",
      "tests/helix-commerce-surfaces.test.tsx",
    ],
  },
  {
    category: "active-legacy-names",
    label: "tracked active-name inventory",
    kind: "static-audit",
    scope: "local",
  },
  {
    category: "active-legacy-names",
    label: "Supabase objects and current data",
    kind: "command",
    scope: "remote",
    args: ["db:helix-rebrand:verify"],
  },
  {
    category: "renamed-resources",
    label: "Product Media",
    kind: "command",
    scope: "remote",
    args: ["verify:product-media", "--json"],
  },
  {
    category: "renamed-resources",
    label: "Product Search",
    kind: "command",
    scope: "remote",
    args: ["product:search:verify"],
  },
  {
    category: "renamed-resources",
    label: "Catalog webhooks",
    kind: "command",
    scope: "remote",
    args: ["catalog:webhooks:verify"],
  },
  {
    category: "renamed-resources",
    label: "Stripe sandbox",
    kind: "command",
    scope: "remote",
    args: ["stripe:sandbox:verify"],
  },
  {
    category: "renamed-resources",
    label: "GitHub workflow and repository",
    kind: "command",
    scope: "remote",
    args: ["github:workflow:plan"],
  },
  {
    category: "affected-journeys",
    label: "Account, Cart, Checkout, Orders, rewards, referrals, and webhooks",
    kind: "command",
    scope: "local",
    args: [
      "vitest",
      "run",
      "tests/helix-commerce-journeys.test.tsx",
      "tests/helix-commerce-boundaries.test.ts",
      "tests/auth-cart.test.ts",
      "tests/checkout-idempotency.test.ts",
      "tests/customer-rewards.test.ts",
      "tests/referral-rewards-server.test.ts",
      "tests/rewards-operations.test.ts",
      "tests/catalog-webhook-route.test.ts",
      "tests/stripe-webhook-signature.test.ts",
    ],
  },
  {
    category: "affected-journeys",
    label: "Public Site and Admin production browser suite",
    kind: "command",
    scope: "local",
    args: ["verify:production"],
  },
] as const satisfies readonly HelixRebrandExecutableCheck[];

function isAllowedHistoricalLine(
  path: string,
  lineNumber: number,
  line: string,
  variant: LegacyNameVariant,
): boolean {
  if (
    path ===
      "docs/adr/0004-complete-the-helix-rebrand-through-coordinated-identifier-migrations.md" &&
    lineNumber === 3
  ) {
    return true;
  }
  if (
    path === "docs/operations/helix-public-hostname.md" &&
    ((lineNumber === 31 && variant === "former-brand") ||
      (lineNumber === 89 && variant === "former-brand"))
  ) {
    return true;
  }
  if (!line.startsWith("_Avoid_:")) return false;
  return (
    (path === "docs/domain/brand-platform/CONTEXT.md" &&
      variant === "former-brand") ||
    (path === "docs/domain/rewards-referrals/CONTEXT.md" &&
      variant === "legacy-rewards-language")
  );
}

export function auditActiveLegacyNames(
  files: readonly AuditedFile[],
): LegacyNameFinding[] {
  const findings: LegacyNameFinding[] = [];

  for (const file of files) {
    if (APPLIED_MIGRATION_PATH.test(file.path)) continue;

    if (FORMER_BRAND_PATTERN.test(file.path)) {
      findings.push({
        path: file.path,
        line: 0,
        variant: "former-brand",
      });
    }
    if (LEGACY_REWARDS_PATTERN.test(file.path)) {
      findings.push({
        path: file.path,
        line: 0,
        variant: "legacy-rewards-language",
      });
    }

    for (const [index, line] of file.content.split(/\r?\n/).entries()) {
      if (
        FORMER_BRAND_PATTERN.test(line) &&
        !isAllowedHistoricalLine(file.path, index + 1, line, "former-brand")
      ) {
        findings.push({
          path: file.path,
          line: index + 1,
          variant: "former-brand",
        });
      }
      if (
        LEGACY_REWARDS_PATTERN.test(line) &&
        !isAllowedHistoricalLine(
          file.path,
          index + 1,
          line,
          "legacy-rewards-language",
        )
      ) {
        findings.push({
          path: file.path,
          line: index + 1,
          variant: "legacy-rewards-language",
        });
      }
    }
  }

  return findings;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runHelixRebrandChecks<TCheck extends HelixRebrandCheck>(
  checks: readonly TCheck[],
  execute: (check: TCheck) => Promise<void>,
): Promise<Readonly<{ ok: boolean; results: HelixRebrandCheckResult[] }>> {
  const results: HelixRebrandCheckResult[] = [];

  for (const check of checks) {
    try {
      await execute(check);
      results.push({
        category: check.category,
        label: check.label,
        ok: true,
      });
    } catch (error) {
      results.push({
        category: check.category,
        error: errorMessage(error),
        label: check.label,
        ok: false,
      });
    }
  }

  return {
    ok: results.every((result) => result.ok),
    results,
  };
}
