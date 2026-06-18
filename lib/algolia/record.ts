// Shared Algolia record shape + pure builder.
//
// This module is import-safe on both the server (webhook/reindex write path)
// and the client (search path): it has no secrets and no Algolia client. It
// defines the storefront-safe document we index and the deterministic mapping
// from a Supabase catalog row to that document.

import type { ProductStatus } from "@/lib/products";
import { statusLabel } from "@/components/productStatus";

/** Default index name when ALGOLIA_INDEX_NAME / NEXT_PUBLIC_ALGOLIA_INDEX_NAME is unset. */
export const DEFAULT_INDEX_NAME = "mei_pelle_products";

/**
 * Raw catalog row used to build a search document. Mirrors the Supabase
 * `products` row (including `id`, which the storefront `Product` type omits)
 * plus its joined variants. Only storefront-safe fields are present.
 */
export type CatalogVariantSource = {
  variant_key: string;
  label: string;
  price_cents: number;
  position: number;
};

export type CatalogProductSource = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  collection: string;
  blurb: string;
  status: string;
  swatch_from: string;
  swatch_to: string;
  position: number | null;
  created_at: string;
  made_for: string | null;
  good_for: string | null;
  texture: string | null;
  product_variants: CatalogVariantSource[] | null;
};

/**
 * The Algolia record. objectID is the product's stable uuid so deletes and
 * upserts are idempotent regardless of slug/name changes. Variant detail is
 * summarized into the parent record so a single product-level result carries
 * everything the result card and relevance need.
 */
export type AlgoliaProductRecord = {
  objectID: string;
  productId: string;
  slug: string;
  title: string;
  subtitle: string;
  descriptor: string;
  collection: string;
  category: string;
  productType: string;
  badge: string | null;
  status: ProductStatus;
  priceMin: number;
  priceMax: number;
  currency: "USD";
  available: boolean;
  waitlist: boolean;
  variantCount: number;
  variantNames: string[];
  keywords: string[];
  swatch: [string, string];
  cardMedia: {
    kind: "gradient";
    colors: [string, string];
  };
  sortOrder: number;
  featuredRank: number;
  createdAt: string;
  madeFor: string | null;
  goodFor: string | null;
  texture: string | null;
};

const VALID_STATUSES: ProductStatus[] = ["available", "coming_soon", "sold_out"];

function toStatus(value: string): ProductStatus {
  return (VALID_STATUSES as string[]).includes(value)
    ? (value as ProductStatus)
    : "available";
}

/** Deterministic Supabase-row → Algolia-record mapping. Pure; no I/O. */
export function buildAlgoliaRecord(
  row: CatalogProductSource,
): AlgoliaProductRecord {
  const variants = (row.product_variants ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);

  const prices = variants.map((v) => v.price_cents);
  const priceMin = prices.length ? Math.min(...prices) : 0;
  const priceMax = prices.length ? Math.max(...prices) : 0;
  const status = toStatus(row.status);

  // Keyword bag for relevance: only storefront-safe descriptive fields.
  const keywords = [
    row.collection,
    row.made_for,
    row.good_for,
    row.texture,
    ...variants.map((v) => v.label),
  ].filter((v): v is string => Boolean(v && v.trim()));

  return {
    objectID: row.id,
    productId: row.id,
    slug: row.slug,
    title: row.name,
    subtitle: row.tagline,
    descriptor: row.blurb,
    collection: row.collection,
    category: row.collection,
    productType: row.collection,
    badge: statusLabel(status),
    status,
    priceMin,
    priceMax,
    currency: "USD",
    available: status === "available",
    waitlist: status === "coming_soon",
    variantCount: variants.length,
    variantNames: variants.map((v) => v.label),
    keywords,
    swatch: [row.swatch_from, row.swatch_to],
    cardMedia: {
      kind: "gradient",
      colors: [row.swatch_from, row.swatch_to],
    },
    sortOrder: row.position ?? 0,
    featuredRank: row.position ?? 0,
    createdAt: row.created_at,
    madeFor: row.made_for,
    goodFor: row.good_for,
    texture: row.texture,
  };
}

/**
 * Index settings applied during (re)index. Tuned for product discovery:
 * title/subtitle weigh highest, descriptor and keywords broaden recall, and
 * featuredRank drives custom ranking so merchandising order is preserved on
 * ties. Kept here (not in the write client) so it is unit-testable.
 */
export type IndexSettings = {
  searchableAttributes: string[];
  attributesForFaceting: string[];
  customRanking: string[];
  attributesToHighlight: string[];
};

export const INDEX_SETTINGS: IndexSettings = {
  searchableAttributes: [
    "title",
    "subtitle",
    "collection",
    "descriptor",
    "unordered(keywords)",
    "unordered(variantNames)",
  ],
  attributesForFaceting: [
    "filterOnly(collection)",
    "filterOnly(available)",
    "status",
  ],
  customRanking: ["asc(featuredRank)", "asc(title)"],
  attributesToHighlight: ["title", "descriptor"],
};
