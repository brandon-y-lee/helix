// Storefront-safe Algolia record and deterministic canonical mapper.

import type { ProductStatus } from "@/lib/products";
import { statusLabel } from "@/lib/catalog/product-status";
import { routineGroupLabel } from "@/lib/catalog/product-routine";

type CatalogVariantSource = {
  variant_key: string;
  label: string;
  price_cents: number;
  sort_order: number;
  available: boolean;
  inventory_status: string;
};

type CatalogMediaSource = {
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

export type CatalogProductSource = {
  id: string;
  slug: string;
  display_name: string;
  formal_title: string;
  card_tagline: string;
  product_type: string;
  badge: string | null;
  catalog_status: string;
  editorial_description: string;
  status: string;
  swatch_from: string;
  swatch_to: string;
  sort_order: number;
  created_at: string;
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
  published_at: string | null;
  updated_at: string | null;
  product_variants: CatalogVariantSource[] | null;
  product_media: CatalogMediaSource[] | null;
};

export type AlgoliaProductRecord = {
  objectID: string;
  productId: string;
  slug: string;
  displayName: string;
  formalTitle: string;
  cardTagline: string;
  editorialDescription: string;
  productType: string;
  routineGroup: "core" | "beyond_core";
  routineStepNumber: number | null;
  routineStepName: string | null;
  routineSort: number;
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
  imageMedia:
    | {
        kind: "image";
        url: string;
        alt: string;
        width: number | null;
        height: number | null;
        role: string;
      }
    | null;
  cardMedia: {
    kind: "gradient";
    colors: [string, string];
  };
  sortOrder: number;
  createdAt: string;
  publishedAt: string | null;
  updatedAt: string | null;
  madeFor: string | null;
  goodFor: string | null;
  texture: string | null;
};

const VALID_STATUSES: ProductStatus[] = [
  "available",
  "coming_soon",
  "sold_out",
];

function toStatus(value: string): ProductStatus {
  return (VALID_STATUSES as string[]).includes(value)
    ? (value as ProductStatus)
    : "available";
}

function toRoutineGroup(
  value: string,
): AlgoliaProductRecord["routineGroup"] {
  if (value === "core" || value === "beyond_core") return value;
  throw new Error(`[search-sync] Unsupported routine group "${value}".`);
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function placeholderFromMedia(
  media: CatalogMediaSource | undefined,
  swatch: [string, string],
): AlgoliaProductRecord["placeholderMedia"] {
  if (!media || media.media_type !== "image" || media.url) return null;
  const palette = media.placeholder_palette ?? {};
  return {
    kind: "placeholder",
    alt: media.alt,
    paletteId: media.palette_id,
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

function imageFromMedia(
  media: CatalogMediaSource | undefined,
): AlgoliaProductRecord["imageMedia"] {
  if (!media || media.media_type !== "image" || !media.url) return null;
  return {
    kind: "image",
    url: media.url,
    alt: media.alt,
    width: media.width,
    height: media.height,
    role: media.role,
  };
}

function mediaRoleRank(role: string): number {
  switch (role) {
    case "search":
      return 0;
    case "card_default":
    case "card":
      return 1;
    case "detail":
    case "hero":
      return 2;
    default:
      return 3;
  }
}

const INDEXED_IMAGE_ROLES = new Set([
  "search",
  "card_default",
  "card",
  "detail",
  "hero",
]);

export function buildAlgoliaRecord(
  row: CatalogProductSource,
): AlgoliaProductRecord {
  const variants = (row.product_variants ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const prices = variants.map((variant) => variant.price_cents);
  const status = toStatus(row.status);
  const availableVariants = variants.filter(
    (variant) =>
      variant.available &&
      variant.inventory_status !== "out_of_stock" &&
      variant.inventory_status !== "unavailable",
  );
  const media = (row.product_media ?? [])
    .slice()
    .sort(
      (a, b) =>
        mediaRoleRank(a.role) - mediaRoleRank(b.role) ||
        a.sort_order - b.sort_order,
    );
  const imageMedia = media.find(
    (item) =>
      item.media_type === "image" &&
      Boolean(item.url) &&
      INDEXED_IMAGE_ROLES.has(item.role),
  );
  const placeholderMedia = media.find(
    (item) => item.media_type === "image" && !item.url,
  );
  const swatch: [string, string] = [row.swatch_from, row.swatch_to];
  const routineGroup = toRoutineGroup(row.routine_group);
  const concerns = row.concerns ?? [];
  const ingredients = [
    ...(row.key_ingredients ?? []),
    ...(row.ingredients
      ? row.ingredients
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : []),
  ];
  const keywords = [
    routineGroupLabel(routineGroup),
    row.routine_step_name,
    row.product_type,
    row.display_name,
    row.formal_title,
    row.card_tagline,
    row.editorial_description,
    row.made_for,
    row.good_for,
    row.texture,
    ...(row.usage_time ?? []),
    ...concerns,
    ...(row.key_ingredients ?? []),
    ...(row.search_keywords ?? []),
    ...variants.map((variant) => variant.label),
  ].filter((value): value is string => Boolean(value?.trim()));

  return {
    objectID: row.id,
    productId: row.id,
    slug: row.slug,
    displayName: row.display_name,
    formalTitle: row.formal_title,
    cardTagline: row.card_tagline,
    editorialDescription: row.editorial_description,
    productType: row.product_type,
    routineGroup,
    routineStepNumber: row.routine_step_number,
    routineStepName: row.routine_step_name,
    routineSort: row.routine_sort,
    badge: statusLabel(status) ?? row.badge,
    status,
    priceMin: prices.length ? Math.min(...prices) : 0,
    priceMax: prices.length ? Math.max(...prices) : 0,
    currency: "USD",
    available:
      row.catalog_status === "active" &&
      status === "available" &&
      availableVariants.length > 0,
    waitlist: status === "coming_soon",
    variantCount: variants.length,
    variantNames: variants.map((variant) => variant.label),
    keywords,
    concerns,
    ingredients,
    swatch,
    placeholderMedia: placeholderFromMedia(placeholderMedia, swatch),
    imageMedia: imageFromMedia(imageMedia),
    cardMedia: {
      kind: "gradient",
      colors: swatch,
    },
    sortOrder: row.routine_sort,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    madeFor: row.made_for,
    goodFor: row.good_for,
    texture: row.texture,
  };
}

export type IndexSettings = {
  searchableAttributes: string[];
  attributesForFaceting: string[];
  customRanking: string[];
  attributesToHighlight: string[];
};

export const INDEX_SETTINGS: IndexSettings = {
  searchableAttributes: [
    "displayName",
    "formalTitle",
    "cardTagline",
    "productType",
    "editorialDescription",
    "unordered(keywords)",
    "unordered(variantNames)",
  ],
  attributesForFaceting: [
    "filterOnly(productType)",
    "filterOnly(routineGroup)",
    "filterOnly(concerns)",
    "filterOnly(available)",
    "status",
  ],
  customRanking: ["asc(sortOrder)", "asc(displayName)"],
  attributesToHighlight: [
    "displayName",
    "cardTagline",
    "editorialDescription",
  ],
};
