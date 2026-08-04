import type { CommerceRoutineGroup } from "@/lib/products";

export const SHOP_COLLECTIONS = [
  {
    slug: "shop",
    label: "Shop All",
    routineGroup: null,
  },
  {
    slug: "core",
    label: "Core",
    routineGroup: "core",
  },
  {
    slug: "beyond-the-core",
    label: "Beyond the Core",
    routineGroup: "beyond_core",
  },
] as const satisfies ReadonlyArray<{
  slug: string;
  label: string;
  routineGroup: CommerceRoutineGroup | null;
}>;

export type ShopCollectionSlug = (typeof SHOP_COLLECTIONS)[number]["slug"];

export const SHOP_COLLECTION_PATHS = SHOP_COLLECTIONS.map(
  ({ slug }) => `/collections/${slug}`,
);

export function getShopCollection(slug: string) {
  return SHOP_COLLECTIONS.find((collection) => collection.slug === slug);
}
