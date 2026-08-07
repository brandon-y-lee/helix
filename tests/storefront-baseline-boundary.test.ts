import { access, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
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

function propertyName(node: ts.PropertyName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return null;
}

function literalCatalogFactViolations(path: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: string[] = [];

  function report(node: ts.Node, fact: string) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    violations.push(`${path}:${line + 1} contains a fixed ${fact}`);
  }

  function visit(node: ts.Node) {
    if (ts.isStringLiteralLike(node)) {
      if (
        /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(node.text) &&
        node.text !== "/products/does-not-exist"
      ) {
        report(node, "Product path");
      }
      if (/\$\d+(?:\.\d{2})?/.test(node.text)) {
        report(node, "Product Offer");
      }
      if (/^\d+ products?$/.test(node.text)) {
        report(node, "Storefront count");
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (
        name &&
        ["offerPrice", "price", "price_cents", "unitPrice"].includes(name) &&
        ts.isNumericLiteral(node.initializer)
      ) {
        report(node, "Product Offer");
      }
      if (
        name === "variantLabel" &&
        ts.isStringLiteralLike(node.initializer)
      ) {
        report(node, "Product Variant label");
      }
    }

    if (ts.isObjectLiteralExpression(node)) {
      const properties = new Map(
        node.properties.flatMap((property) =>
          ts.isPropertyAssignment(property) && propertyName(property.name)
            ? [[propertyName(property.name)!, property.initializer] as const]
            : [],
        ),
      );
      if (["objectID", "variantNames", "searchText"].some((key) => properties.has(key))) {
        report(node, "partial search projection");
      }
      const variantLabel = properties.get("label");
      if (
        ["variant_key", "price_cents", "inventory_status"].some((key) =>
          properties.has(key)
        ) &&
        variantLabel &&
        ts.isStringLiteralLike(variantLabel)
      ) {
        report(node, "Product Variant label");
      }
    }

    if (ts.isCallExpression(node)) {
      const call = node.getText(sourceFile);
      const [expected] = node.arguments;
      const method = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : null;
      if (
        method === "toHaveCount" &&
        expected &&
        ts.isNumericLiteral(expected) &&
        Number(expected.text) > 0 &&
        /product-(?:card|count)/.test(call)
      ) {
        report(node, "Storefront count");
      }
      if (
        method &&
        ["toBe", "toEqual", "toHaveText"].includes(method) &&
        expected &&
        (ts.isNumericLiteral(expected) || ts.isStringLiteralLike(expected)) &&
        /(?:offer|price)/i.test(call)
      ) {
        report(node, "Product Offer");
      }
      if (
        method &&
        ["toBe", "toEqual", "toHaveText"].includes(method) &&
        expected &&
        ts.isStringLiteralLike(expected) &&
        /(?:variant|quick-option)/i.test(call)
      ) {
        report(node, "Product Variant label");
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /variant/i.test(node.name.text) &&
      node.initializer
    ) {
      function inspectVariantInitializer(descendant: ts.Node) {
        if (
          ts.isPropertyAssignment(descendant) &&
          propertyName(descendant.name) === "name" &&
          ts.isStringLiteralLike(descendant.initializer)
        ) {
          report(descendant, "Product Variant label");
        }
        ts.forEachChild(descendant, inspectVariantInitializer);
      }
      inspectVariantInitializer(node.initializer);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
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

  it("recognizes every retired Catalog authority shape", () => {
    const violations = literalCatalogFactViolations(
      "synthetic-caller.ts",
      `
        page.goto("/products/fixed-product");
        expect(page.locator(".product-card")).toHaveCount(6);
        expect(price).toBe(2200);
        const variant = page.getByRole("button", { name: "Fixed size" });
        const record = { objectID: "fixed", name: "Partial record" };
      `,
    );

    expect(violations).toEqual([
      expect.stringContaining("fixed Product path"),
      expect.stringContaining("fixed Storefront count"),
      expect.stringContaining("fixed Product Offer"),
      expect.stringContaining("fixed Product Variant label"),
      expect.stringContaining("fixed partial search projection"),
    ]);
  });

  it("keeps test and tooling callers free of fixed Catalog projections", async () => {
    const root = process.cwd();
    const files = [
      ...(await sourceFiles(resolve(root, "e2e"))),
      ...(await sourceFiles(resolve(root, "test-support"))),
      resolve(root, "scripts/db/verify-supabase-data.ts"),
    ];
    const violations = (
      await Promise.all(
        files.map(async (file) =>
          literalCatalogFactViolations(
            relative(root, file),
            await readFile(file, "utf8"),
          ),
        ),
      )
    ).flat();
    const storefront = await readFile(resolve(root, "e2e/storefront.spec.ts"), "utf8");
    const search = await readFile(
      resolve(root, "e2e/search.spec.ts"),
      "utf8",
    );

    expect(violations).toEqual([]);
    expect(storefront).toMatch(/storefront\.products\(\)/);
    expect(storefront).toMatch(/purchase\.variant\.label/);
    expect(search).toMatch(/buildStorefrontSearchRecord\(product\)/);
    expect(search).toMatch(/product\.path/);
  });
});
