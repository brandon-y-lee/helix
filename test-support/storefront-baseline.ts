import { firstPurchasableVariant, type ProductStatus } from "@/lib/products";
import { isProductMediaRole } from "@/lib/catalog/media-roles";

const CATALOG_STATUSES = ["active", "draft", "archived"] as const;
const PRODUCT_STATUSES = ["available", "coming_soon", "sold_out"] as const;
const ROUTINE_GROUPS = ["core", "beyond_core"] as const;
const INVENTORY_STATUSES = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "unavailable",
] as const;

type CatalogStatus = (typeof CATALOG_STATUSES)[number];
type RoutineGroup = (typeof ROUTINE_GROUPS)[number];
type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export type StorefrontCatalogVariant = {
  variant_key: string;
  label: string;
  price_cents: number;
  sort_order: number;
  available: boolean;
  inventory_status: string;
};

export type StorefrontCatalogMedia = {
  media_type: string;
  url: string | null;
  alt: string;
  width: number | null;
  height: number | null;
  role: string;
  sort_order: number;
  palette_id: string | null;
  placeholder_palette: Record<string, string> | null;
};

export type StorefrontCatalogProduct = {
  id: string;
  slug: string;
  display_name: string;
  formal_title: string;
  card_tagline: string;
  product_type: string;
  badge: string | null;
  currency: string;
  catalog_status: string;
  status: string;
  editorial_description: string;
  swatch_from: string;
  swatch_to: string;
  sort_order: number;
  created_at: string;
  published_at: string | null;
  updated_at: string | null;
  made_for: string | null;
  good_for: string | null;
  texture: string | null;
  key_ingredients: string[];
  ingredients: string | null;
  concerns: string[];
  usage_time: string[];
  search_keywords: string[];
  routine_group: string;
  routine_step_number: number | null;
  routine_step_name: string | null;
  routine_sort: number;
  product_variants: StorefrontCatalogVariant[] | null;
  product_media: StorefrontCatalogMedia[] | null;
};

export type StorefrontCatalogRoutineComplement = {
  product_id: string;
  related_product_id: string;
  relationship_type: string;
  sort_order: number;
};

export type StorefrontCatalogRead = {
  products: readonly StorefrontCatalogProduct[];
  routineComplements: readonly StorefrontCatalogRoutineComplement[];
};

export type StorefrontCatalogReadAdapter = {
  readCatalog: () => Promise<StorefrontCatalogRead>;
};

export type StorefrontSnapshotVariant = Readonly<{
  id: string;
  label: string;
  price: number;
  available: boolean;
  inventoryStatus: InventoryStatus;
  sortOrder: number;
}>;

export type StorefrontSnapshotMedia = Readonly<{
  kind: "image" | "video" | "placeholder";
  url: string | null;
  alt: string;
  width: number | null;
  height: number | null;
  role: string;
  sortOrder: number;
  paletteId: string | null;
  placeholderPalette: Readonly<Record<string, string>> | null;
}>;

export type StorefrontSnapshotProduct = Readonly<{
  id: string;
  slug: string;
  path: string;
  displayName: string;
  formalTitle: string;
  cardTagline: string;
  productType: string;
  badge: string | null;
  currency: "USD";
  catalogStatus: CatalogStatus;
  merchandisingStatus: ProductStatus;
  editorialDescription: string;
  swatch: readonly [string, string];
  sortOrder: number;
  createdAt: string;
  publishedAt: string | null;
  updatedAt: string | null;
  madeFor: string | null;
  goodFor: string | null;
  texture: string | null;
  keyIngredients: readonly string[];
  ingredients: string | null;
  concerns: readonly string[];
  usageTime: readonly string[];
  searchKeywords: readonly string[];
  routineGroup: RoutineGroup;
  systemPosition: number | null;
  systemStepName: string | null;
  routineSort: number;
  variants: readonly StorefrontSnapshotVariant[];
  media: readonly StorefrontSnapshotMedia[];
  offer: Readonly<{
    variantId: string;
    label: string;
    price: number;
    currency: "USD";
  }> | null;
}>;

export type StorefrontSnapshot = Readonly<{
  schemaVersion: 1;
  products: readonly StorefrontSnapshotProduct[];
  routineComplements: readonly Readonly<{
    productId: string;
    relatedProductId: string;
    sortOrder: number;
  }>[];
  journeys: Readonly<{
    coreProductId: string;
    beyondCoreProductId: string;
    purchasableProductId: string;
    richPdpProductId: string;
    searchableProductId: string;
  }>;
}>;

export type StorefrontBaselineErrorCode =
  | "catalog-read-failed"
  | "catalog-read-timeout"
  | "duplicate-product-identity"
  | "duplicate-product-path"
  | "duplicate-product-variant"
  | "duplicate-routine-complement"
  | "invalid-catalog-shape"
  | "invalid-ordering"
  | "invalid-product"
  | "invalid-product-media"
  | "invalid-product-offer"
  | "invalid-product-path"
  | "invalid-product-variant"
  | "invalid-routine-complement"
  | "invalid-snapshot-artifact"
  | "missing-journey-capability"
  | "unsupported-catalog-status"
  | "unsupported-currency"
  | "unsupported-merchandising-status"
  | "unsupported-routine-group";

export class StorefrontBaselineError extends Error {
  constructor(
    readonly code: StorefrontBaselineErrorCode,
    readonly detail: string,
    options?: ErrorOptions,
  ) {
    super(`[storefront-baseline:${code}] ${detail}`, options);
    this.name = "StorefrontBaselineError";
  }
}

function memberOf<const T extends readonly string[]>(
  values: T,
  value: string,
): value is T[number] {
  return values.includes(value);
}

function requireText(value: string, field: string, identity: string): string {
  if (value.trim()) return value;
  throw new StorefrontBaselineError(
    "invalid-product",
    `Product "${identity}" requires a non-empty ${field}.`,
  );
}

function requireOrder(value: number, field: string, identity: string): number {
  if (Number.isInteger(value) && value >= 0) return value;
  throw new StorefrontBaselineError(
    "invalid-ordering",
    `Product "${identity}" has invalid ${field} ${String(value)}.`,
  );
}

function normalizeProduct(
  row: StorefrontCatalogProduct,
): StorefrontSnapshotProduct {
  const id = requireText(row.id, "id", row.slug || "unknown");
  const slug = requireText(row.slug, "slug", id);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new StorefrontBaselineError(
      "invalid-product-path",
      `Product "${id}" has invalid Storefront slug "${slug}".`,
    );
  }
  if (!memberOf(CATALOG_STATUSES, row.catalog_status)) {
    throw new StorefrontBaselineError(
      "unsupported-catalog-status",
      `Product "${slug}" has unsupported Catalog Status "${row.catalog_status}".`,
    );
  }
  if (!memberOf(PRODUCT_STATUSES, row.status)) {
    throw new StorefrontBaselineError(
      "unsupported-merchandising-status",
      `Product "${slug}" has unsupported Merchandising Status "${row.status}".`,
    );
  }
  if (!memberOf(ROUTINE_GROUPS, row.routine_group)) {
    throw new StorefrontBaselineError(
      "unsupported-routine-group",
      `Product "${slug}" has unsupported Routine Group "${row.routine_group}".`,
    );
  }
  if (row.currency !== "USD") {
    throw new StorefrontBaselineError(
      "unsupported-currency",
      `Product "${slug}" has unsupported currency "${row.currency}".`,
    );
  }
  if (
    row.routine_step_number !== null &&
    (!Number.isInteger(row.routine_step_number) || row.routine_step_number <= 0)
  ) {
    throw new StorefrontBaselineError(
      "invalid-ordering",
      `Product "${slug}" has invalid System Step ordering ${String(row.routine_step_number)}.`,
    );
  }

  const variantIds = new Set<string>();
  const variants = (row.product_variants ?? [])
    .map((variant) => {
      if (!memberOf(INVENTORY_STATUSES, variant.inventory_status)) {
        throw new StorefrontBaselineError(
          "invalid-product-variant",
          `Product "${slug}" variant "${variant.variant_key}" has unsupported Inventory Status "${variant.inventory_status}".`,
        );
      }
      if (!Number.isInteger(variant.price_cents) || variant.price_cents < 0) {
        throw new StorefrontBaselineError(
          "invalid-product-offer",
          `Product "${slug}" variant "${variant.variant_key}" has invalid price.`,
        );
      }
      const variantId = requireText(variant.variant_key, "variant key", slug);
      if (variantIds.has(variantId)) {
        throw new StorefrontBaselineError(
          "duplicate-product-variant",
          `Product "${slug}" has duplicate Product Variant "${variantId}".`,
        );
      }
      variantIds.add(variantId);
      return {
        id: variantId,
        label: requireText(variant.label, "variant label", slug),
        price: variant.price_cents,
        available: variant.available,
        inventoryStatus: variant.inventory_status,
        sortOrder: requireOrder(variant.sort_order, "variant sort order", slug),
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const merchandisingStatus = row.status;
  const selectedOffer = firstPurchasableVariant({
    displayName: row.display_name,
    status: merchandisingStatus,
    variants,
  });
  const media = (row.product_media ?? [])
    .map((item) => {
      if (!isProductMediaRole(item.role)) {
        throw new StorefrontBaselineError(
          "invalid-product-media",
          `Product "${slug}" has unsupported media role "${item.role}".`,
        );
      }
      if (item.media_type !== "image" && item.media_type !== "video") {
        throw new StorefrontBaselineError(
          "invalid-product-media",
          `Product "${slug}" has unsupported media type "${item.media_type}".`,
        );
      }
      return {
        kind: item.media_type === "video" ? "video" as const : item.url ? "image" as const : "placeholder" as const,
        url: item.url,
        alt: requireText(item.alt, "media alt text", slug),
        width: item.width,
        height: item.height,
        role: item.role,
        sortOrder: requireOrder(item.sort_order, "media sort order", slug),
        paletteId: item.palette_id,
        placeholderPalette: item.placeholder_palette,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.role.localeCompare(b.role));

  return {
    id,
    slug,
    path: `/products/${slug}`,
    displayName: requireText(row.display_name, "display name", slug),
    formalTitle: requireText(row.formal_title, "formal title", slug),
    cardTagline: requireText(row.card_tagline, "card tagline", slug),
    productType: requireText(row.product_type, "product type", slug),
    badge: row.badge,
    currency: "USD",
    catalogStatus: row.catalog_status,
    merchandisingStatus,
    editorialDescription: requireText(
      row.editorial_description,
      "editorial description",
      slug,
    ),
    swatch: [row.swatch_from, row.swatch_to],
    sortOrder: requireOrder(row.sort_order, "Storefront sort order", slug),
    createdAt: row.created_at,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    madeFor: row.made_for,
    goodFor: row.good_for,
    texture: row.texture,
    keyIngredients: [...row.key_ingredients],
    ingredients: row.ingredients,
    concerns: [...row.concerns],
    usageTime: [...row.usage_time],
    searchKeywords: [...row.search_keywords],
    routineGroup: row.routine_group,
    systemPosition: row.routine_step_number,
    systemStepName: row.routine_step_name,
    routineSort: requireOrder(row.routine_sort, "Routine ordering", slug),
    variants,
    media,
    offer: selectedOffer
      ? {
          variantId: selectedOffer.id,
          label: selectedOffer.label,
          price: selectedOffer.price,
          currency: "USD",
        }
      : null,
  };
}

function hasRichPdpMedia(product: StorefrontSnapshotProduct): boolean {
  const roles = new Set(
    product.media.filter((item) => Boolean(item.url)).map((item) => item.role),
  );
  return (
    product.offer !== null &&
    roles.has("routine_video") &&
    roles.has("routine_video_poster") &&
    roles.has("gallery")
  );
}

function requireCapability(
  products: readonly StorefrontSnapshotProduct[],
  name: string,
  predicate: (product: StorefrontSnapshotProduct) => boolean,
): StorefrontSnapshotProduct {
  const product = products.find(predicate);
  if (product) return product;
  throw new StorefrontBaselineError(
    "missing-journey-capability",
    `The active Storefront has no Product capable of the ${name} journey.`,
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function serializeStorefrontSnapshot(
  snapshot: StorefrontSnapshot,
): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function deserializeStorefrontSnapshot(
  serialized: string,
): StorefrontSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (cause) {
    throw new StorefrontBaselineError(
      "invalid-snapshot-artifact",
      "The Storefront snapshot artifact is not valid JSON.",
      { cause },
    );
  }
  if (
    !value ||
    typeof value !== "object" ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !Array.isArray((value as { products?: unknown }).products) ||
    !Array.isArray((value as { routineComplements?: unknown }).routineComplements) ||
    !(value as { journeys?: unknown }).journeys ||
    typeof (value as { journeys?: unknown }).journeys !== "object"
  ) {
    throw new StorefrontBaselineError(
      "invalid-snapshot-artifact",
      "The Storefront snapshot artifact does not match schema version 1.",
    );
  }
  return deepFreeze(value as StorefrontSnapshot);
}

function buildStorefrontSnapshot(
  catalog: StorefrontCatalogRead,
): StorefrontSnapshot {
  const normalizedProducts = catalog.products.map(normalizeProduct);
  const productIds = new Set<string>();
  const productPaths = new Set<string>();
  for (const product of normalizedProducts) {
    if (productIds.has(product.id)) {
      throw new StorefrontBaselineError(
        "duplicate-product-identity",
        `Product identity "${product.id}" appears more than once.`,
      );
    }
    if (productPaths.has(product.path)) {
      throw new StorefrontBaselineError(
        "duplicate-product-path",
        `Storefront path "${product.path}" appears more than once.`,
      );
    }
    productIds.add(product.id);
    productPaths.add(product.path);
  }

  const products = normalizedProducts
    .filter((product) => product.catalogStatus === "active")
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.slug.localeCompare(b.slug) ||
        a.id.localeCompare(b.id),
    );
  const ids = new Set(products.map((product) => product.id));
  const routineComplements = catalog.routineComplements
    .map((relationship) => {
      if (relationship.relationship_type !== "complete_the_routine") {
        throw new StorefrontBaselineError(
          "invalid-routine-complement",
          `Unsupported Routine Complement type "${relationship.relationship_type}".`,
        );
      }
      if (
        !Number.isInteger(relationship.sort_order) ||
        relationship.sort_order < 0
      ) {
        throw new StorefrontBaselineError(
          "invalid-routine-complement",
          `Routine Complement "${relationship.product_id}" -> "${relationship.related_product_id}" has invalid sort order.`,
        );
      }
      return {
        productId: relationship.product_id,
        relatedProductId: relationship.related_product_id,
        sortOrder: relationship.sort_order,
      };
    })
    .sort(
      (a, b) =>
        a.productId.localeCompare(b.productId) ||
        a.sortOrder - b.sortOrder ||
        a.relatedProductId.localeCompare(b.relatedProductId),
    );

  const core = requireCapability(
    products,
    "The Core Routine Group",
    (product) => product.routineGroup === "core",
  );
  const beyond = requireCapability(
    products,
    "Beyond The Core Routine Group",
    (product) => product.routineGroup === "beyond_core",
  );
  const purchasable = requireCapability(
    products,
    "Purchasable Product",
    (product) => product.offer !== null,
  );
  const richPdp = requireCapability(
    products,
    "rich PDP media",
    hasRichPdpMedia,
  );
  const searchable = requireCapability(
    products,
    "searchable Product",
    (product) => product.offer !== null && product.displayName.length > 0,
  );

  const complementKeys = new Set<string>();
  for (const relationship of routineComplements) {
    const complementKey = `${relationship.productId}:${relationship.relatedProductId}`;
    if (complementKeys.has(complementKey)) {
      throw new StorefrontBaselineError(
        "duplicate-routine-complement",
        `Routine Complement "${relationship.productId}" -> "${relationship.relatedProductId}" appears more than once.`,
      );
    }
    complementKeys.add(complementKey);
    if (relationship.productId === relationship.relatedProductId) {
      throw new StorefrontBaselineError(
        "invalid-routine-complement",
        `Routine Complement for "${relationship.productId}" cannot reference itself.`,
      );
    }
    if (
      !ids.has(relationship.productId) ||
      !ids.has(relationship.relatedProductId)
    ) {
      throw new StorefrontBaselineError(
        "invalid-routine-complement",
        `Routine Complement "${relationship.productId}" -> "${relationship.relatedProductId}" must reference active Products.`,
      );
    }
  }

  return deepFreeze({
    schemaVersion: 1,
    products,
    routineComplements,
    journeys: {
      coreProductId: core.id,
      beyondCoreProductId: beyond.id,
      purchasableProductId: purchasable.id,
      richPdpProductId: richPdp.id,
      searchableProductId: searchable.id,
    },
  });
}

export async function createStorefrontBaseline(
  adapter: StorefrontCatalogReadAdapter,
): Promise<StorefrontSnapshot> {
  let catalog: StorefrontCatalogRead;
  try {
    catalog = await adapter.readCatalog();
  } catch (cause) {
    if (cause instanceof StorefrontBaselineError) throw cause;
    throw new StorefrontBaselineError(
      "catalog-read-failed",
      "The approved Supabase Catalog could not be read.",
      { cause },
    );
  }

  try {
    return buildStorefrontSnapshot(catalog);
  } catch (cause) {
    if (cause instanceof StorefrontBaselineError) throw cause;
    throw new StorefrontBaselineError(
      "invalid-catalog-shape",
      "The approved Supabase Catalog returned malformed public Storefront data.",
      { cause },
    );
  }
}
