import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CANONICAL_COLLECTIONS,
  CANONICAL_COMMERCE_PRODUCTS,
  EXPECTED_COMPLETE_THE_ROUTINE_RELATIONSHIPS,
  LEGACY_SEED_PRODUCT_SLUGS,
  PROTECTED_CLEANUP_REFERENCE_TABLES,
} from "../catalog/canonical-catalog-manifest";
import { exactCount } from "./supabase-ops";

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  display_name: string | null;
  catalog_status: string;
  collection: string | null;
  routine_group: string | null;
  routine_display_label: string | null;
};

type CollectionRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
};

type ProductVariantRow = {
  id: string;
  product_id: string;
  variant_key: string;
  sku: string | null;
};

type RelationshipRow = {
  product_id: string;
  related_product_id: string;
  relationship_type: string;
};

type CleanupReferenceCounts = {
  variants: number;
  media: number;
  sources: number;
  relationships: number;
  cartItems: number;
  orderItems: number;
};

export type CatalogAudit = {
  generatedAt: string;
  canonicalSlugs: string[];
  activeCanonicalProducts: Array<{
    slug: string;
    activeCount: number;
    routineDisplayLabel: string | null;
    routineGroup: string | null;
  }>;
  unexpectedActiveProducts: ProductRow[];
  protectActiveProductCount: number;
  legacyActiveProductCount: number;
  duplicateProductSlugs: Array<{ slug: string; count: number }>;
  duplicateVariantKeys: Array<{ productId: string; variantKey: string; count: number }>;
  duplicateVariantSkus: Array<{ sku: string; count: number }>;
  activeCollections: Array<{ slug: string; name: string }>;
  duplicateCollectionSlugs: Array<{ slug: string; count: number }>;
  completeTheRoutineCount: number;
  duplicateRelationships: Array<{
    productId: string;
    relatedProductId: string;
    relationshipType: string;
    count: number;
  }>;
  staleRelationshipCount: number;
  protectedCleanupReferenceTables: readonly string[];
  tableCounts: Record<string, number>;
  cleanupCandidates: Array<{
    id: string;
    slug: string;
    name: string;
    catalogStatus: string;
  }>;
  cleanupReferenceCounts: CleanupReferenceCounts;
};

export type CleanupPlan = {
  mode: "dry-run" | "apply";
  generatedAt: string;
  candidateCount: number;
  deletableProductIds: string[];
  deletableSlugs: string[];
  referenceCounts: CleanupReferenceCounts;
  variantRowsExpectedToCascade: number;
  protectedReferenceCount: number;
  nonVariantReferenceCount: number;
  safeToApply: boolean;
  reasons: string[];
};

const PUBLIC_TABLES = [
  "products",
  "product_variants",
  "product_media",
  "product_relationships",
  "product_sources",
  "collections",
  "profiles",
  "carts",
  "cart_items",
  "orders",
  "order_items",
  "payment_attempts",
  "stripe_customers",
  "stripe_webhook_events",
  "loyalty_accounts",
  "loyalty_ledger_entries",
  "loyalty_redemptions",
  "referral_codes",
  "referral_attributions",
  "referral_rewards",
  "private_feedback",
  "trustpilot_invitation_attempts",
] as const;

function countBy<T>(rows: readonly T[], keyFor: (row: T) => string): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

async function selectAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) throw new Error(`[db-audit] Failed to read ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

async function selectByProductIds<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  productIds: readonly string[],
): Promise<T[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await supabase.from(table).select(columns).in("product_id", [...productIds]);
  if (error) throw new Error(`[db-audit] Failed to inspect ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

async function selectRelationshipsByProductIds(
  supabase: SupabaseClient,
  productIds: readonly string[],
): Promise<RelationshipRow[]> {
  if (productIds.length === 0) return [];

  const ids = productIds.join(",");
  const { data, error } = await supabase
    .from("product_relationships")
    .select("product_id, related_product_id, relationship_type")
    .or(`product_id.in.(${ids}),related_product_id.in.(${ids})`);

  if (error) {
    throw new Error(`[db-audit] Failed to inspect product_relationships: ${error.message}`);
  }
  return (data ?? []) as RelationshipRow[];
}

export async function buildCatalogAudit(supabase: SupabaseClient): Promise<CatalogAudit> {
  const products = await selectAll<ProductRow>(
    supabase,
    "products",
    "id, slug, name, display_name, catalog_status, collection, routine_group, routine_display_label",
  );
  const collections = await selectAll<CollectionRow>(
    supabase,
    "collections",
    "id, slug, name, is_active",
  );
  const variants = await selectAll<ProductVariantRow>(
    supabase,
    "product_variants",
    "id, product_id, variant_key, sku",
  );
  const relationships = await selectAll<RelationshipRow>(
    supabase,
    "product_relationships",
    "product_id, related_product_id, relationship_type",
  );

  const canonicalSlugs = CANONICAL_COMMERCE_PRODUCTS.map((product) => product.slug);
  const canonicalSlugSet = new Set<string>(canonicalSlugs);
  const legacySeedSlugSet = new Set<string>(LEGACY_SEED_PRODUCT_SLUGS);
  const canonicalIds = new Set(
    products
      .filter((product) => canonicalSlugSet.has(product.slug) && product.catalog_status === "active")
      .map((product) => product.id),
  );
  const cleanupCandidates = products
    .filter((product) => legacySeedSlugSet.has(product.slug))
    .map((product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      catalogStatus: product.catalog_status,
    }));
  const cleanupProductIds = cleanupCandidates.map((candidate) => candidate.id);
  const cleanupReferences = await getCleanupReferenceCounts(supabase, cleanupProductIds);
  const tableCounts = Object.fromEntries(
    await Promise.all(
      PUBLIC_TABLES.map(async (table) => [table, await exactCount(supabase, table)] as const),
    ),
  );

  return {
    generatedAt: new Date().toISOString(),
    canonicalSlugs,
    activeCanonicalProducts: canonicalSlugs.map((slug) => {
      const active = products.filter(
        (product) => product.slug === slug && product.catalog_status === "active",
      );
      return {
        slug,
        activeCount: active.length,
        routineDisplayLabel: active[0]?.routine_display_label ?? null,
        routineGroup: active[0]?.routine_group ?? null,
      };
    }),
    unexpectedActiveProducts: products.filter(
      (product) => product.catalog_status === "active" && !canonicalSlugSet.has(product.slug),
    ),
    protectActiveProductCount: products.filter((product) => {
      const searchable = `${product.slug} ${product.name} ${product.display_name ?? ""}`.toLowerCase();
      return product.catalog_status === "active" && searchable.includes("protect");
    }).length,
    legacyActiveProductCount: products.filter(
      (product) =>
        product.catalog_status === "active" &&
        (["RESET", "RECODE"].includes(product.name) ||
          String(product.display_name ?? "").match(/^(RESET|RECODE)$/) ||
          String(product.collection ?? "").toLowerCase().includes("method")),
    ).length,
    duplicateProductSlugs: countBy(products, (product) => product.slug).map(({ key, count }) => ({
      slug: key,
      count,
    })),
    duplicateVariantKeys: countBy(
      variants,
      (variant) => `${variant.product_id}:${variant.variant_key}`,
    ).map(({ key, count }) => {
      const [productId, variantKey] = key.split(":");
      return {
        productId: productId ?? "",
        variantKey: variantKey ?? "",
        count,
      };
    }),
    duplicateVariantSkus: countBy(
      variants.filter((variant) => variant.sku !== null),
      (variant) => variant.sku ?? "",
    ).map(({ key, count }) => ({
      sku: key,
      count,
    })),
    activeCollections: collections
      .filter((collection) => collection.is_active)
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((collection) => ({ slug: collection.slug, name: collection.name })),
    duplicateCollectionSlugs: countBy(collections, (collection) => collection.slug).map(
      ({ key, count }) => ({ slug: key, count }),
    ),
    completeTheRoutineCount: relationships.filter(
      (relationship) =>
        relationship.relationship_type === "complete_the_routine" &&
        canonicalIds.has(relationship.product_id) &&
        canonicalIds.has(relationship.related_product_id),
    ).length,
    duplicateRelationships: countBy(
      relationships,
      (relationship) =>
        `${relationship.product_id}:${relationship.related_product_id}:${relationship.relationship_type}`,
    ).map(({ key, count }) => {
      const [productId, relatedProductId, relationshipType] = key.split(":");
      return {
        productId: productId ?? "",
        relatedProductId: relatedProductId ?? "",
        relationshipType: relationshipType ?? "",
        count,
      };
    }),
    staleRelationshipCount: relationships.filter(
      (relationship) =>
        relationship.relationship_type === "complete_the_routine" &&
        (!canonicalIds.has(relationship.product_id) || !canonicalIds.has(relationship.related_product_id)),
    ).length,
    protectedCleanupReferenceTables: PROTECTED_CLEANUP_REFERENCE_TABLES,
    tableCounts,
    cleanupCandidates,
    cleanupReferenceCounts: cleanupReferences,
  };
}

export async function buildCleanupPlan(
  supabase: SupabaseClient,
  mode: "dry-run" | "apply",
): Promise<CleanupPlan> {
  const candidates = await getCleanupCandidates(supabase);
  const productIds = candidates.map((candidate) => candidate.id);
  const referenceCounts = await getCleanupReferenceCounts(supabase, productIds);
  const nonArchived = candidates.filter((candidate) => candidate.catalog_status !== "archived");
  const missingCount =
    candidates.length === 0 ? 0 : LEGACY_SEED_PRODUCT_SLUGS.length - candidates.length;
  const protectedReferenceCount = referenceCounts.cartItems + referenceCounts.orderItems;
  const nonVariantReferenceCount =
    referenceCounts.media + referenceCounts.sources + referenceCounts.relationships;
  const reasons: string[] = [];

  if (missingCount > 0) {
    reasons.push(
      `${missingCount} legacy seed slug(s) were not found. A fully cleaned database should have zero; a pre-cleanup database should have all ${LEGACY_SEED_PRODUCT_SLUGS.length}.`,
    );
  }
  if (nonArchived.length > 0) {
    reasons.push(
      `Found non-archived cleanup candidate(s): ${nonArchived
        .map((candidate) => `${candidate.slug}:${candidate.catalog_status}`)
        .join(", ")}`,
    );
  }
  if (protectedReferenceCount > 0) {
    reasons.push(
      `Found ${protectedReferenceCount} protected cart/order reference(s); refusing cleanup.`,
    );
  }
  if (nonVariantReferenceCount > 0) {
    reasons.push(
      `Found ${nonVariantReferenceCount} non-variant catalog reference(s); manual review required.`,
    );
  }

  const safeToApply =
    reasons.length === 0 &&
    (candidates.length === 0 || candidates.length === LEGACY_SEED_PRODUCT_SLUGS.length);

  return {
    mode,
    generatedAt: new Date().toISOString(),
    candidateCount: candidates.length,
    deletableProductIds: safeToApply ? productIds : [],
    deletableSlugs: safeToApply ? candidates.map((candidate) => candidate.slug) : [],
    referenceCounts,
    variantRowsExpectedToCascade: referenceCounts.variants,
    protectedReferenceCount,
    nonVariantReferenceCount,
    safeToApply,
    reasons,
  };
}

export function assertCatalogAudit(audit: CatalogAudit): void {
  const failures: string[] = [];
  const expectedCollectionSlugs = new Set(CANONICAL_COLLECTIONS.map((collection) => collection.slug));
  const activeCollectionSlugs = new Set(audit.activeCollections.map((collection) => collection.slug));

  for (const product of audit.activeCanonicalProducts) {
    if (product.activeCount !== 1) {
      failures.push(`Expected exactly one active product for ${product.slug}, got ${product.activeCount}.`);
    }
  }
  for (const collectionSlug of expectedCollectionSlugs) {
    if (!activeCollectionSlugs.has(collectionSlug)) {
      failures.push(`Expected active collection ${collectionSlug}.`);
    }
  }
  if (audit.unexpectedActiveProducts.length > 0) {
    failures.push(
      `Unexpected active product(s): ${audit.unexpectedActiveProducts
        .map((product) => product.slug)
        .join(", ")}.`,
    );
  }
  if (audit.protectActiveProductCount > 0) {
    failures.push("PROTECT must remain editorial only; found active commerce product row.");
  }
  if (audit.legacyActiveProductCount > 0) {
    failures.push("Found active legacy RESET/RECODE/Method commerce labeling.");
  }
  if (audit.duplicateProductSlugs.length > 0) {
    failures.push("Found duplicate product slugs.");
  }
  if (audit.duplicateVariantKeys.length > 0) {
    failures.push("Found duplicate product variant natural keys.");
  }
  if (audit.duplicateVariantSkus.length > 0) {
    failures.push("Found duplicate non-null product variant SKUs.");
  }
  if (audit.duplicateCollectionSlugs.length > 0) {
    failures.push("Found duplicate collection slugs.");
  }
  if (audit.duplicateRelationships.length > 0) {
    failures.push("Found duplicate product relationship natural keys.");
  }
  if (audit.completeTheRoutineCount !== EXPECTED_COMPLETE_THE_ROUTINE_RELATIONSHIPS) {
    failures.push(
      `Expected ${EXPECTED_COMPLETE_THE_ROUTINE_RELATIONSHIPS} complete_the_routine relationships, got ${audit.completeTheRoutineCount}.`,
    );
  }
  if (audit.staleRelationshipCount > 0) {
    failures.push("Found complete_the_routine relationship(s) involving stale product IDs.");
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
}

async function getCleanupCandidates(supabase: SupabaseClient): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, name, display_name, catalog_status, collection, routine_group, routine_display_label")
    .in("slug", [...LEGACY_SEED_PRODUCT_SLUGS])
    .order("slug");

  if (error) throw new Error(`[db-cleanup] Failed to inspect cleanup candidates: ${error.message}`);
  return (data ?? []) as ProductRow[];
}

async function getCleanupReferenceCounts(
  supabase: SupabaseClient,
  productIds: readonly string[],
): Promise<CleanupReferenceCounts> {
  const [variants, media, sources, relationships, cartItems, orderItems] = await Promise.all([
    selectByProductIds(supabase, "product_variants", "id, product_id", productIds),
    selectByProductIds(supabase, "product_media", "id, product_id", productIds),
    selectByProductIds(supabase, "product_sources", "product_id", productIds),
    selectRelationshipsByProductIds(supabase, productIds),
    selectByProductIds(supabase, "cart_items", "id, product_id", productIds),
    selectByProductIds(supabase, "order_items", "id, product_id", productIds),
  ]);

  return {
    variants: variants.length,
    media: media.length,
    sources: sources.length,
    relationships: relationships.length,
    cartItems: cartItems.length,
    orderItems: orderItems.length,
  };
}
