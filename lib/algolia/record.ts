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
  sort_order: number | null;
  available: boolean;
  inventory_status: string;
};

export type CatalogMediaSource = {
  media_kind: string | null;
  url: string | null;
  alt: string;
  role: string;
  sort_order: number;
  palette_id: string | null;
  placeholder_palette: Record<string, string> | null;
};

export type CatalogProductSource = {
  id: string;
  slug: string;
  name: string;
  display_name: string | null;
  formal_title: string | null;
  tagline: string;
  card_tagline: string | null;
  collection: string;
  action_name: string | null;
  routine_number: string | null;
  routine_group: string | null;
  routine_group_label: string | null;
  routine_step_number: number | null;
  routine_step_name: string | null;
  routine_display_label: string | null;
  routine_sort: number | null;
  subtitle: string | null;
  descriptor: string | null;
  product_type: string | null;
  badge: string | null;
  catalog_status: string;
  blurb: string;
  description: string;
  editorial_description: string | null;
  editorial_how_to_use: string | null;
  status: string;
  swatch_from: string;
  swatch_to: string;
  position: number | null;
  featured_rank: number | null;
  sort_order: number | null;
  created_at: string;
  made_for: string | null;
  good_for: string | null;
  texture: string | null;
  key_ingredients: string[] | null;
  ingredients: string | null;
  concerns: string[] | null;
  routine_step: string | null;
  usage_time: string[] | null;
  search_keywords: string[] | null;
  published_at: string | null;
  updated_at: string | null;
  product_variants: CatalogVariantSource[] | null;
  product_media: CatalogMediaSource[] | null;
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
  displayName: string;
  formalTitle: string;
  cardTagline: string;
  editorialDescription: string;
  subtitle: string;
  descriptor: string;
  collection: string;
  collections: string[];
  category: string;
  productType: string;
  routineGroup: "core" | "beyond_core" | null;
  routineGroupLabel: string | null;
  routineStepNumber: number | null;
  routineStepName: string | null;
  routineDisplayLabel: string | null;
  routineSort: number | null;
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
  concerns: string[];
  ingredients: string[];
  swatch: [string, string];
  placeholderMedia:
    | {
        kind: "placeholder";
        alt: string;
        paletteId: string | null;
        palette: {
          start: string;
          end: string;
          accent?: string;
          surface?: string;
          ink?: string;
          highlight?: string;
        };
      }
    | null;
  cardMedia: {
    kind: "gradient";
    colors: [string, string];
  };
  sortOrder: number;
  featuredRank: number;
  createdAt: string;
  publishedAt: string | null;
  updatedAt: string | null;
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

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function placeholderFromMedia(
  media: CatalogMediaSource | undefined,
  swatch: [string, string],
): AlgoliaProductRecord["placeholderMedia"] {
  if (!media || media.media_kind !== "placeholder") return null;
  const palette = media.placeholder_palette ?? {};
  return {
    kind: "placeholder",
    alt: media.alt,
    paletteId: media.palette_id ?? null,
    palette: {
      start: isHex(palette.start) ? palette.start : swatch[0],
      end: isHex(palette.end) ? palette.end : swatch[1],
      accent: isHex(palette.accent) ? palette.accent : undefined,
      surface: isHex(palette.surface) ? palette.surface : undefined,
      ink: isHex(palette.ink) ? palette.ink : undefined,
      highlight: isHex(palette.highlight) ? palette.highlight : undefined,
    },
  };
}

function toRoutineGroup(value: string | null): "core" | "beyond_core" | null {
  return value === "core" || value === "beyond_core" ? value : null;
}

/** Deterministic Supabase-row → Algolia-record mapping. Pure; no I/O. */
export function buildAlgoliaRecord(
  row: CatalogProductSource,
): AlgoliaProductRecord {
  const variants = (row.product_variants ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? a.position) - (b.sort_order ?? b.position));

  const prices = variants.map((v) => v.price_cents);
  const priceMin = prices.length ? Math.min(...prices) : 0;
  const priceMax = prices.length ? Math.max(...prices) : 0;
  const status = toStatus(row.status);
  const availableVariants = variants.filter(
    (variant) =>
      variant.available &&
      variant.inventory_status !== "out_of_stock" &&
      variant.inventory_status !== "unavailable",
  );
  const media = (row.product_media ?? [])
    .slice()
    .sort((a, b) => {
      const roleA = a.role === "search" ? -2 : a.role === "card_default" || a.role === "card" ? -1 : 1;
      const roleB = b.role === "search" ? -2 : b.role === "card_default" || b.role === "card" ? -1 : 1;
      return roleA - roleB || a.sort_order - b.sort_order;
    })[0];
  const swatch: [string, string] = [row.swatch_from, row.swatch_to];
  const displayName = row.display_name ?? row.name;
  const formalTitle = row.formal_title ?? row.name;
  const cardTagline = row.card_tagline ?? row.tagline;
  const editorialDescription = row.editorial_description ?? row.description ?? row.blurb;
  const routineGroup = toRoutineGroup(row.routine_group);
  const routineGroupLabel = row.routine_group_label ?? null;
  const routineDisplayLabel = row.routine_display_label ?? routineGroupLabel;
  const concerns = row.concerns ?? [];
  const ingredients = [
    ...(row.key_ingredients ?? []),
    ...(row.ingredients ? row.ingredients.split(",").map((item) => item.trim()).filter(Boolean) : []),
  ];

  // Keyword bag for relevance: only storefront-safe descriptive fields.
  const keywords = [
    routineGroupLabel,
    routineDisplayLabel,
    row.action_name,
    row.routine_step_name,
    row.product_type,
    displayName,
    formalTitle,
    cardTagline,
    editorialDescription,
    row.made_for,
    row.good_for,
    row.texture,
    ...(row.usage_time ?? []),
    ...concerns,
    ...(row.key_ingredients ?? []),
    ...(row.search_keywords ?? []),
    ...variants.map((v) => v.label),
  ].filter((v): v is string => Boolean(v && v.trim()));

  return {
    objectID: row.id,
    productId: row.id,
    slug: row.slug,
    title: displayName,
    displayName,
    formalTitle,
    cardTagline,
    editorialDescription,
    subtitle: row.subtitle ?? cardTagline,
    descriptor: row.descriptor ?? editorialDescription,
    collection: routineGroupLabel ?? row.collection,
    collections: [routineGroupLabel ?? row.collection],
    category: routineGroupLabel ?? row.collection,
    productType: row.product_type ?? row.collection,
    routineGroup,
    routineGroupLabel,
    routineStepNumber: row.routine_step_number,
    routineStepName: row.routine_step_name,
    routineDisplayLabel,
    routineSort: row.routine_sort,
    badge: statusLabel(status) ?? row.badge,
    status,
    priceMin,
    priceMax,
    currency: "USD",
    available: row.catalog_status === "active" && status === "available" && availableVariants.length > 0,
    waitlist: status === "coming_soon",
    variantCount: variants.length,
    variantNames: variants.map((v) => v.label),
    keywords,
    concerns,
    ingredients,
    swatch,
    placeholderMedia: placeholderFromMedia(media, swatch),
    cardMedia: {
      kind: "gradient",
      colors: swatch,
    },
    sortOrder: row.routine_sort ?? row.sort_order ?? row.position ?? 0,
    featuredRank:
      row.routine_sort ?? row.featured_rank ?? row.sort_order ?? row.position ?? 0,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
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
    "displayName",
    "title",
    "formalTitle",
    "cardTagline",
    "subtitle",
    "collection",
    "collections",
    "productType",
    "descriptor",
    "editorialDescription",
    "unordered(keywords)",
    "unordered(variantNames)",
  ],
  attributesForFaceting: [
    "filterOnly(collection)",
    "filterOnly(collections)",
    "filterOnly(productType)",
    "filterOnly(routineGroup)",
    "filterOnly(routineGroupLabel)",
    "filterOnly(concerns)",
    "filterOnly(available)",
    "status",
  ],
  customRanking: ["asc(featuredRank)", "asc(sortOrder)", "asc(title)"],
  attributesToHighlight: ["title", "displayName", "descriptor"],
};
