import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { APPROVED_SUPABASE_PROJECT_REF } from "../../lib/supabase/project-safety";
import { isRetiredProductIdentity } from "./product-search-identity";

type ProductKeywordSnapshot = {
  productId: string;
  slug: string;
  revision: number;
  searchKeywords: string[];
};
type Reservation = { sourceSlug: string; targetProductId: string; routeKind: string };
type KeywordInventory = {
  projectRef: string;
  capturedAt: string;
  activeProducts: ProductKeywordSnapshot[];
  reservations: Reservation[];
};

const normalized = (value: string) => value.trim().toLowerCase().replace(/[-\s]+/g, " ");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Produces reviewed field diffs only. Publication uses the current Catalog workflow. */
export function planProductSearchKeywordCleanup(input: unknown) {
  const inventory = input as KeywordInventory | null;
  if (!inventory || inventory.projectRef !== APPROVED_SUPABASE_PROJECT_REF
      || typeof inventory.capturedAt !== "string" || !Number.isFinite(Date.parse(inventory.capturedAt))
      || !Array.isArray(inventory.activeProducts) || !Array.isArray(inventory.reservations)) {
    throw new Error("A dated keyword inventory from the approved project is required.");
  }
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const product of inventory.activeProducts) {
    if (!product || !uuid.test(product.productId) || typeof product.slug !== "string" || !product.slug
        || !Number.isSafeInteger(product.revision) || product.revision < 0
        || !Array.isArray(product.searchKeywords) || product.searchKeywords.some((term) => typeof term !== "string")
        || ids.has(product.productId) || slugs.has(product.slug)) {
      throw new Error("Keyword inventory has an invalid or duplicate current Product snapshot.");
    }
    ids.add(product.productId);
    slugs.add(product.slug);
  }
  for (const reservation of inventory.reservations) {
    if (!reservation || typeof reservation.sourceSlug !== "string" || !reservation.sourceSlug
        || !uuid.test(reservation.targetProductId)
        || !["canonical", "rename", "replacement"].includes(reservation.routeKind)) {
      throw new Error("Keyword inventory has invalid Product reservation evidence.");
    }
  }
  const changes = inventory.activeProducts.flatMap((product) => {
    const formerTerms = new Set(inventory.reservations
      .filter((reservation) => reservation.targetProductId === product.productId && reservation.routeKind !== "canonical")
      .map((reservation) => normalized(reservation.sourceSlug)));
    const retired = (term: string) => isRetiredProductIdentity(term) || formerTerms.has(normalized(term));
    const removedKeywords = product.searchKeywords.filter(retired);
    return removedKeywords.length ? [{
      productId: product.productId,
      slug: product.slug,
      expectedRevision: product.revision,
      expectedKeywords: [...product.searchKeywords],
      searchKeywords: product.searchKeywords.filter((term) => !retired(term)),
      removedKeywords,
    }] : [];
  });
  return {
    mode: "review-only" as const,
    projectRef: inventory.projectRef,
    capturedAt: inventory.capturedAt,
    inspectedProducts: inventory.activeProducts.length,
    changes,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) throw new Error("Pass one saved keyword inventory JSON file.");
  console.log(JSON.stringify(planProductSearchKeywordCleanup(JSON.parse(readFileSync(file, "utf8"))), null, 2));
}
