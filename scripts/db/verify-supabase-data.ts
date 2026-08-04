import {
  CANONICAL_COMMERCE_PRODUCTS,
  EXPECTED_COMPLETE_THE_ROUTINE_RELATIONSHIPS,
} from "../../lib/catalog/canonical-catalog";
import { createOpsClient, printJson } from "./supabase-ops";

type ProductRow = {
  id: string;
  slug: string;
  display_name: string;
  catalog_status: string;
  routine_group: string | null;
  routine_step_number: number | null;
  routine_step_name: string | null;
  routine_sort: number | null;
};

type VariantRow = {
  product_id: string;
  variant_key: string;
  sku: string | null;
};

type RelationshipRow = {
  product_id: string;
  related_product_id: string;
  relationship_type: string;
};

function duplicateKeys<T>(rows: readonly T[], keyFor: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1);
}

async function run(): Promise<void> {
  const supabase = createOpsClient();
  const [productResult, variantResult, relationshipResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, slug, display_name, catalog_status, routine_group, routine_step_number, routine_step_name, routine_sort",
      ),
    supabase
      .from("product_variants")
      .select("product_id, variant_key, sku"),
    supabase
      .from("product_relationships")
      .select("product_id, related_product_id, relationship_type"),
  ]);

  if (productResult.error) {
    throw new Error(`[db-verify] Failed to read products: ${productResult.error.message}`);
  }
  if (variantResult.error) {
    throw new Error(`[db-verify] Failed to read variants: ${variantResult.error.message}`);
  }
  if (relationshipResult.error) {
    throw new Error(
      `[db-verify] Failed to read relationships: ${relationshipResult.error.message}`,
    );
  }

  const products = (productResult.data ?? []) as ProductRow[];
  const variants = (variantResult.data ?? []) as VariantRow[];
  const relationships = (relationshipResult.data ?? []) as RelationshipRow[];
  const canonicalSlugs = new Set<string>(
    CANONICAL_COMMERCE_PRODUCTS.map((product) => product.slug),
  );
  const failures: string[] = [];
  const activeCanonicalProducts = CANONICAL_COMMERCE_PRODUCTS.map((expected) => {
    const matches = products.filter(
      (product) =>
        product.slug === expected.slug && product.catalog_status === "active",
    );
    const actual = matches[0];
    if (matches.length !== 1) {
      failures.push(
        `Expected exactly one active product for ${expected.slug}; found ${matches.length}.`,
      );
    } else if (
      actual.routine_group !== expected.routineGroup ||
      actual.routine_step_number !== expected.routineStepNumber ||
      actual.routine_step_name !== expected.routineStepName ||
      actual.routine_sort !== expected.routineSort
    ) {
      failures.push(`Canonical routine fields differ for ${expected.slug}.`);
    }
    return {
      slug: expected.slug,
      activeCount: matches.length,
      id: actual?.id ?? null,
    };
  });

  const unexpectedActive = products.filter(
    (product) =>
      product.catalog_status === "active" && !canonicalSlugs.has(product.slug),
  );
  if (unexpectedActive.length > 0) {
    failures.push(
      `Unexpected active product(s): ${unexpectedActive.map((product) => product.slug).join(", ")}.`,
    );
  }
  if (
    products.some(
      (product) =>
        product.catalog_status === "active" &&
        `${product.slug} ${product.display_name}`.toLowerCase().includes("protect"),
    )
  ) {
    failures.push("PROTECT must remain editorial-only.");
  }
  if (duplicateKeys(products, (product) => product.slug).length > 0) {
    failures.push("Duplicate product slugs found.");
  }
  if (
    duplicateKeys(
      variants,
      (variant) => `${variant.product_id}:${variant.variant_key}`,
    ).length > 0
  ) {
    failures.push("Duplicate product variant keys found.");
  }
  if (
    duplicateKeys(
      variants.filter((variant) => variant.sku !== null),
      (variant) => variant.sku ?? "",
    ).length > 0
  ) {
    failures.push("Duplicate non-null product variant SKUs found.");
  }
  if (
    duplicateKeys(
      relationships,
      (relationship) =>
        `${relationship.product_id}:${relationship.related_product_id}:${relationship.relationship_type}`,
    ).length > 0
  ) {
    failures.push("Duplicate product relationships found.");
  }

  const canonicalIds = new Set(
    activeCanonicalProducts.flatMap((product) =>
      product.id ? [product.id] : [],
    ),
  );
  const completeTheRoutine = relationships.filter(
    (relationship) => relationship.relationship_type === "complete_the_routine",
  );
  const canonicalCompleteTheRoutine = completeTheRoutine.filter(
    (relationship) =>
      canonicalIds.has(relationship.product_id) &&
      canonicalIds.has(relationship.related_product_id),
  );
  if (
    canonicalCompleteTheRoutine.length !==
    EXPECTED_COMPLETE_THE_ROUTINE_RELATIONSHIPS
  ) {
    failures.push(
      `Expected ${EXPECTED_COMPLETE_THE_ROUTINE_RELATIONSHIPS} canonical complete_the_routine relationships; found ${canonicalCompleteTheRoutine.length}.`,
    );
  }
  if (canonicalCompleteTheRoutine.length !== completeTheRoutine.length) {
    failures.push("Stale complete_the_routine relationships found.");
  }

  if (failures.length > 0) throw new Error(failures.join("\n"));

  printJson({
    ok: true,
    generatedAt: new Date().toISOString(),
    activeCanonicalProducts,
    completeTheRoutineCount: canonicalCompleteTheRoutine.length,
  });
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
