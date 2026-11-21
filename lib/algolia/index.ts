import { runtimeSupabaseTarget, type SupabaseTarget } from "../supabase/project-safety";

export const LEGACY_PRODUCTS_INDEX = ["mei", "pelle", "products"].join("_");
export const HELIX_PRODUCTS_INDEX = "helix_products" as const;

export const HELIX_DEVELOPMENT_PRODUCTS_INDEX = "helix_products_dev" as const;

export function productsIndexForTarget(target: SupabaseTarget) {
  return target === "production" ? HELIX_PRODUCTS_INDEX : HELIX_DEVELOPMENT_PRODUCTS_INDEX;
}

export function expectedSearchAppId(env: Record<string, string | undefined>, target: SupabaseTarget) {
  return target === "development" ? env.HELIX_DEVELOPMENT_ALGOLIA_APP_ID : env.HELIX_PRODUCTION_ALGOLIA_APP_ID;
}

export function isHelixProductsIndex(
  value: string | undefined,
): value is ReturnType<typeof productsIndexForTarget> {
  return value === productsIndexForTarget(runtimeSupabaseTarget());
}
