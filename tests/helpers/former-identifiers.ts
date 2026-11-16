const LOWERCASE_BRAND_PARTS = ["mei", "pelle"] as const;
const TITLECASE_BRAND_PARTS = ["Mei", "Pelle"] as const;
const UPPERCASE_BRAND_PARTS = ["MEI", "PELLE"] as const;

export const FORMER_BRAND_NAME = TITLECASE_BRAND_PARTS.join(" ");
export const FORMER_BRAND_NAME_UPPERCASE = UPPERCASE_BRAND_PARTS.join(" ");
export const FORMER_BRAND_SLUG = LOWERCASE_BRAND_PARTS.join("-");
export const FORMER_BRAND_SNAKE = LOWERCASE_BRAND_PARTS.join("_");
export const FORMER_PRODUCTS_INDEX = [
  ...LOWERCASE_BRAND_PARTS,
  "products",
].join("_");
export const FORMER_CATALOG_BUCKET = [
  ...LOWERCASE_BRAND_PARTS,
  "catalog",
].join("-");
export const FORMER_REPOSITORY = `brandon-y-lee/${FORMER_BRAND_SLUG}`;
export const LEGACY_REWARDS_WORD = ["loyal", "ty"].join("");
export const FORMER_REWARDS_NAME = `${FORMER_BRAND_NAME_UPPERCASE} REWARDS`;

export const FORMER_BRAND_PATTERN = new RegExp(
  LOWERCASE_BRAND_PARTS.join("[\\s_-]+"),
  "i",
);
export const LEGACY_REWARDS_PATTERN = new RegExp(LEGACY_REWARDS_WORD, "i");

export function formerRewardsIdentifier(suffix: string): string {
  return `${LEGACY_REWARDS_WORD}${suffix}`;
}
