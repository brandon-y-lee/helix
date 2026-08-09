import { describe, expect, it } from "vitest";

import {
  fingerprintCatalog,
  fingerprintConfiguration,
  fingerprintRuntimeFiles,
} from "@/scripts/github/verification-fingerprints";

describe("verification fingerprints", () => {
  it("normalizes canonical Catalog facts without retaining their raw values", () => {
    const first = fingerprintCatalog([
      { variants: [{ price: 3200, id: "standard" }], slug: "cleanser" },
    ]);
    const reorderedKeys = fingerprintCatalog([
      { slug: "cleanser", variants: [{ id: "standard", price: 3200 }] },
    ]);

    expect(first).toBe(reorderedKeys);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first).not.toContain("cleanser");
    expect(first).not.toContain("3200");
  });

  it("changes runtime identity for versioned runtime files but carries it across reviewed docs", () => {
    const baseline = fingerprintRuntimeFiles([
      { contents: "export const value = 1;\n", path: "app/page.tsx" },
      { contents: "old docs\n", path: "docs/guide.md" },
    ]);

    expect(fingerprintRuntimeFiles([
      { contents: "export const value = 1;\n", path: "app/page.tsx" },
      { contents: "new docs\n", path: "docs/guide.md" },
    ])).toBe(baseline);
    expect(fingerprintRuntimeFiles([
      { contents: "export const value = 2;\n", path: "app/page.tsx" },
      { contents: "old docs\n", path: "docs/guide.md" },
    ])).not.toBe(baseline);
    expect(fingerprintRuntimeFiles([
      { contents: "export const value = 1;\n", path: "app/page.tsx" },
      { contents: "runtime content\n", path: "content/guide.md" },
    ])).not.toBe(baseline);
  });

  it("binds allowlisted non-secret configuration without exposing its values", () => {
    const fingerprint = fingerprintConfiguration({
      NEXT_PUBLIC_ALGOLIA_APP_ID: "public-app-id",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      STRIPE_SECRET_KEY: "must-not-be-read",
    });

    expect(fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fingerprint).not.toContain("public-app-id");
    expect(fingerprint).not.toContain("must-not-be-read");
    expect(fingerprintConfiguration({
      NEXT_PUBLIC_ALGOLIA_APP_ID: "different-public-app-id",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    })).not.toBe(fingerprint);
    expect(fingerprintConfiguration({
      NEXT_PUBLIC_ALGOLIA_APP_ID: "public-app-id",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SITE_URL: "https://mei-pelle.example",
    })).not.toBe(fingerprint);
    expect(fingerprintConfiguration({
      NEXT_PUBLIC_ALGOLIA_APP_ID: "public-app-id",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_public",
    })).not.toBe(fingerprint);
  });
});
