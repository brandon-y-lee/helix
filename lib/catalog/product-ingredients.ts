import type { Product } from "@/lib/products";

export type ResolvedFullInci = {
  text: string;
  source: "products.ingredients" | "product_details.sourceFullInci";
};

const unavailableInciPatterns = [
  /\bunavailable\b/i,
  /\bnot (?:publicly )?(?:available|provided)\b/i,
  /\bsource highlights?\b/i,
  /\bcheck (?:the )?(?:carton|packaging|label)\b/i,
];

function normalizeInci(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function isCompleteCompatibilityInci(value: string): boolean {
  if (unavailableInciPatterns.some((pattern) => pattern.test(value))) {
    return false;
  }

  const ingredients = value.split(",").map((part) => part.trim()).filter(Boolean);
  return ingredients.length >= 5;
}

/**
 * Resolve the canonical complete INCI without promoting highlights or notes.
 * `sourceFullInci` remains a compatibility fallback for already-linked catalog
 * records and is accepted only when it has the shape of a complete list.
 */
export function resolveFullInci(product: Product): ResolvedFullInci | null {
  const canonical = normalizeInci(product.ingredients);
  if (canonical) {
    return {
      text: canonical,
      source: "products.ingredients",
    };
  }

  const compatibility = normalizeInci(product.productDetails.sourceFullInci);
  if (compatibility && isCompleteCompatibilityInci(compatibility)) {
    return {
      text: compatibility,
      source: "product_details.sourceFullInci",
    };
  }

  return null;
}
