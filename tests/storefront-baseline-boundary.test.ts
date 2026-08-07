import { access, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

describe("Storefront Baseline import boundary", () => {
  it("keeps application runtime modules out of the test/tooling namespace", async () => {
    const root = process.cwd();
    const files = (
      await Promise.all(
        ["app", "components", "lib"].map((directory) =>
          sourceFiles(resolve(root, directory)),
        ),
      )
    ).flat();
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (source.includes("test-support/")) {
        violations.push(relative(root, file));
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps read-only Catalog verification on the shared structural contract", async () => {
    const root = process.cwd();
    const retiredAuthority = resolve(
      root,
      "lib/catalog/canonical-catalog.ts",
    );
    const verification = await readFile(
      resolve(root, "scripts/db/verify-supabase-data.ts"),
      "utf8",
    );

    await expect(access(retiredAuthority)).rejects.toThrow();
    expect(verification).toMatch(/createStorefrontBaseline/);
    expect(verification).toMatch(/createSupabaseStorefrontCatalogAdapter/);
    expect(verification).not.toMatch(
      /canonical-catalog|CANONICAL_COMMERCE_PRODUCTS|EXPECTED_COMPLETE_THE_ROUTINE_RELATIONSHIPS|\.from\(/,
    );
  });

  it("keeps Storefront and search journeys free of fixed Catalog projections", async () => {
    const root = process.cwd();
    const storefront = await readFile(
      resolve(root, "e2e/storefront.spec.ts"),
      "utf8",
    );
    const search = await readFile(resolve(root, "e2e/search.spec.ts"), "utf8");

    expect(storefront).toMatch(/storefront\.products\(\)/);
    expect(storefront).toMatch(/purchase\.variant\.label/);
    expect(storefront).not.toMatch(
      /page\.goto\(["']\/products\/(?!does-not-exist)/,
    );
    expect(storefront).not.toMatch(/\b6 products?\b|\$\d+\.\d{2}/);

    expect(search).toMatch(/buildStorefrontSearchRecord\(product\)/);
    expect(search).toMatch(/product\.path/);
    expect(search).not.toMatch(/\b(?:objectID|variantNames|searchText)\s*:/);
    expect(search).not.toMatch(
      /page\.goto\(["']\/products\/(?!does-not-exist)/,
    );
  });
});
