export const HELIX_PRODUCTS_INDEX = "helix_products" as const;

export function isHelixProductsIndex(
  value: string | undefined,
): value is typeof HELIX_PRODUCTS_INDEX {
  return value === HELIX_PRODUCTS_INDEX;
}
