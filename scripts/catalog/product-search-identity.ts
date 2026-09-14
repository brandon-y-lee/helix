/** Exact retired identities used by controlled cleanup and verification. */
export const RETIRED_PRODUCT_SLUGS = [
  "reset-01-calming-gel-cleanser",
  "cleanse-01-calming-gel-cleanser",
  "recode-03-pdrn-5-ampoule",
  "treat-03-pdrn-5-ampoule",
  "peptide-bounce",
  "maxxing-serum",
  "refine-02-pore-treatment-pads",
  "frame-04-pdrn-eye-cream",
  "lift-06-pdrn-mask-system",
  "seal-05-green-collagen-cream",
] as const;

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

const retiredIdentities = new Set(RETIRED_PRODUCT_SLUGS.map(normalizeIdentity));

/** Match complete former names/slugs, preserving meaningful ingredient words. */
export function isRetiredProductIdentity(value: string): boolean {
  return retiredIdentities.has(normalizeIdentity(value));
}
