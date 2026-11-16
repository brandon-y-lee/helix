import type { PdpProduct } from "@/lib/catalog/models";

export type ResolvedFullInci = {
  text: string;
  source: "products.ingredients";
};

const unavailableInciPatterns = [
  /\bunavailable\b/i,
  /\bnot (?:publicly )?(?:available|provided)\b/i,
  /\bsource highlights?\b/i,
  /\bcheck (?:the )?(?:product )?(?:carton|packaging|label)\b/i,
];

function normalizeInci(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}

/**
 * Resolve the canonical complete INCI without promoting highlights or notes.
 * Runtime rendering uses the governed canonical INCI field. Historical import
 * evidence remains in Catalog history and does not supply a runtime fallback.
 */
export function resolveFullInci(
  product: Pick<PdpProduct, "ingredients">,
): ResolvedFullInci | null {
  const canonical = normalizeInci(product.ingredients);
  if (
    canonical &&
    !unavailableInciPatterns.some((pattern) => pattern.test(canonical))
  ) {
    return {
      text: canonical,
      source: "products.ingredients",
    };
  }

  return null;
}
