// Canonical full product projection used only by `/system`.
//
// Storefront cards, PDPs, discovery, metadata, routes, and Core summaries use
// the purpose-specific readers in `lib/catalog/storefront.ts`. Supabase is the
// required catalog source and there is no static or legacy-column fallback.

import { getSupabaseClient } from "@/lib/supabase";
import { isProductStatus } from "@/lib/products";
import {
  normalizeProductPdpContent,
  type ProductPdpContentRow,
} from "@/lib/catalog/product-content";
import type {
  CatalogStatus,
  CommerceRoutineGroup,
  Product,
  ProductMedia,
  ProductStatus,
  Variant,
} from "@/lib/products";
import {
  systemStepFromDatabaseRelation,
  type SystemStepDatabaseRelation,
} from "@/lib/catalog/system-steps";

export type { Product } from "@/lib/products";

type ProductRow = {
  id: string;
  slug: string;
  display_name: string;
  product_type: string;
  badge: string | null;
  currency: string;
  sort_order: number;
  editorial_description: string;
  benefits: string[];
  editorial_how_to_use: string;
  formula_notes: string[];
  swatch_from: string;
  swatch_to: string;
  status: string;
  catalog_status: string;
  made_for: string | null;
  good_for: string | null;
  texture: string | null;
  key_ingredients: string[];
  ingredients: string | null;
  cautions: string[];
  finish: string | null;
  volume: string | null;
  skin_types: string[];
  concerns: string[];
  usage_time: string[];
  seo_title: string | null;
  seo_description: string | null;
  search_keywords: string[];
  routine_group: string;
  system_step_name: string | null;
  system_steps: SystemStepDatabaseRelation;
  routine_sort: number;
  created_at: string;
  product_pdp_content:
    | ProductPdpContentRow
    | ProductPdpContentRow[]
    | null;
  product_variants: VariantRow[] | null;
  product_media: MediaRow[] | null;
};

type VariantRow = {
  variant_key: string;
  label: string;
  price_cents: number;
  compare_at_price_cents: number | null;
  sku: string | null;
  available: boolean;
  inventory_status: string;
  option_values: Record<string, string> | null;
  volume: string | null;
  pack_count: number | null;
  sort_order: number;
};

type MediaRow = {
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

const PRODUCT_SELECT =
  "id, slug, display_name, product_type, badge, currency, " +
  "sort_order, editorial_description, benefits, editorial_how_to_use, formula_notes, " +
  "swatch_from, swatch_to, status, catalog_status, made_for, good_for, texture, " +
  "key_ingredients, ingredients, cautions, finish, volume, skin_types, concerns, " +
  "usage_time, seo_title, seo_description, search_keywords, routine_group, " +
  "system_step_name, system_steps ( name, position, routine_group ), routine_sort, created_at, " +
  "product_pdp_content ( schema_version, profile_title_tokens, routine_overlay, " +
  "outcome_heading, outcome_labels, how_to_use_steps, application_steps, " +
  "ingredient_cards, ingredient_story, routine_guidance ), " +
  "product_variants ( variant_key, label, price_cents, compare_at_price_cents, sku, " +
  "available, inventory_status, option_values, volume, pack_count, sort_order ), " +
  "product_media ( media_type, url, alt, width, height, role, sort_order, palette_id, placeholder_palette )";

const VALID_CATALOG_STATUSES: CatalogStatus[] = [
  "active",
  "draft",
  "archived",
];
const VALID_INVENTORY_STATUSES = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "unavailable",
] as const;

function toStatus(value: string): ProductStatus {
  return isProductStatus(value) ? value : "available";
}

function toCatalogStatus(value: string): CatalogStatus {
  return (VALID_CATALOG_STATUSES as string[]).includes(value)
    ? (value as CatalogStatus)
    : "active";
}

function toInventoryStatus(value: string): Variant["inventoryStatus"] {
  return (VALID_INVENTORY_STATUSES as readonly string[]).includes(value)
    ? (value as Variant["inventoryStatus"])
    : "in_stock";
}

function toCommerceRoutineGroup(value: string): CommerceRoutineGroup {
  if (value === "core" || value === "beyond_core") return value;
  throw new Error(`[catalog] Unsupported canonical routine group "${value}".`);
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function toPalette(
  value: Record<string, string> | null | undefined,
  fallback: [string, string],
): NonNullable<ProductMedia["palette"]> {
  return {
    start: isHex(value?.start) ? value.start : fallback[0],
    end: isHex(value?.end) ? value.end : fallback[1],
    accent: isHex(value?.accent) ? value.accent : undefined,
    surface: isHex(value?.surface) ? value.surface : undefined,
    ink: isHex(value?.ink) ? value.ink : undefined,
    highlight: isHex(value?.highlight) ? value.highlight : undefined,
  };
}

export function resolveProductPresentationMedia(
  media: readonly ProductMedia[],
): Pick<
  Product,
  | "cardMedia"
  | "cardHoverMedia"
  | "heroMedia"
  | "detailMedia"
  | "cartMedia"
  | "searchMedia"
> {
  const presentationMedia = media.filter(
    (item) =>
      item.kind !== "video" &&
      [
        "card_default",
        "card",
        "card_hover",
        "detail",
        "hero",
        "gallery",
        "cart",
        "search",
      ].includes(item.role),
  );
  const cardMedia =
    presentationMedia.find((item) => item.role === "card_default") ??
    presentationMedia.find((item) => item.role === "card") ??
    presentationMedia.find((item) => item.role === "detail") ??
    presentationMedia.find((item) => item.role === "hero") ??
    null;
  const cardHoverMedia =
    presentationMedia.find((item) => item.role === "card_hover") ??
    cardMedia;
  const heroMedia =
    presentationMedia.find((item) => item.role === "detail") ??
    presentationMedia.find((item) => item.role === "hero") ??
    cardMedia;
  const detailMedia =
    presentationMedia.find((item) => item.role === "detail") ??
    heroMedia;

  return {
    cardMedia,
    cardHoverMedia,
    heroMedia,
    detailMedia,
    cartMedia:
      presentationMedia.find((item) => item.role === "cart") ?? cardMedia,
    searchMedia:
      presentationMedia.find((item) => item.role === "search") ?? cardMedia,
  };
}

function mediaRole(role: string): ProductMedia["role"] {
  switch (role) {
    case "card":
    case "hero":
    case "gallery":
    case "detail":
    case "card_default":
    case "card_hover":
    case "cart":
    case "search":
    case "routine_video":
    case "routine_video_poster":
    case "profile_editorial":
    case "ingredients_texture":
    case "core_routine_texture":
    case "core_routine_editorial":
    case "pdp_outcome":
    case "pdp_application":
      return role;
    default:
      return "gallery";
  }
}

function firstPdpContent(
  value: ProductPdpContentRow | ProductPdpContentRow[] | null,
): ProductPdpContentRow | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function mapProductRow(row: ProductRow): Product {
  const routineGroup = toCommerceRoutineGroup(row.routine_group);
  const systemStep = systemStepFromDatabaseRelation(row.system_steps);
  if (
    row.system_step_name &&
    (!systemStep ||
      systemStep.name !== row.system_step_name ||
      systemStep.routineGroup !== routineGroup)
  ) {
    throw new Error(
      `[catalog] Unsupported System Step "${row.system_step_name}" for ${row.slug}.`,
    );
  }
  if (row.catalog_status === "active" && !systemStep) {
    throw new Error(`[catalog] Active Product ${row.slug} has no System Step.`);
  }
  const swatch: [string, string] = [row.swatch_from, row.swatch_to];
  const variants: Variant[] = (row.product_variants ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((variant) => ({
      id: variant.variant_key,
      label: variant.label,
      price: variant.price_cents,
      compareAtPrice: variant.compare_at_price_cents,
      sku: variant.sku,
      available: variant.available,
      inventoryStatus: toInventoryStatus(variant.inventory_status),
      volume: variant.volume,
      packCount: variant.pack_count,
      optionValues: variant.option_values ?? {},
      sortOrder: variant.sort_order,
    }));
  const media: ProductMedia[] = (row.product_media ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => {
      const kind =
        item.media_type === "video"
          ? "video"
          : item.url
            ? "image"
            : "placeholder";
      return {
        kind,
        url: item.url,
        alt: item.alt,
        width: item.width,
        height: item.height,
        role: mediaRole(item.role),
        sortOrder: item.sort_order,
        paletteId: item.palette_id,
        palette:
          kind === "placeholder"
            ? toPalette(item.placeholder_palette, swatch)
            : null,
      };
    });

  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    productType: row.product_type,
    routineGroup,
    systemStepName: systemStep?.name ?? null,
    systemStepPosition: systemStep?.position ?? null,
    routineSort: row.routine_sort,
    badge: row.badge,
    currency: row.currency === "USD" ? "USD" : "USD",
    sortOrder: row.sort_order,
    description: row.editorial_description,
    benefits: row.benefits,
    howToUse: row.editorial_how_to_use,
    formulaNotes: row.formula_notes,
    variants,
    swatch,
    media,
    ...resolveProductPresentationMedia(media),
    status: toStatus(row.status),
    catalogStatus: toCatalogStatus(row.catalog_status),
    madeFor: row.made_for,
    goodFor: row.good_for,
    texture: row.texture,
    keyIngredients: row.key_ingredients,
    ingredients: row.ingredients,
    cautions: row.cautions,
    finish: row.finish,
    volume: row.volume,
    skinTypes: row.skin_types,
    concerns: row.concerns,
    usageTime: row.usage_time,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    searchKeywords: row.search_keywords,
    pdpContent: normalizeProductPdpContent(
      firstPdpContent(row.product_pdp_content),
      row.slug,
    ),
    createdAt: row.created_at,
  };
}

export async function getProducts(): Promise<Product[]> {
  const { data, error } = await getSupabaseClient()
    .from("products")
    .select(PRODUCT_SELECT)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(
      `[catalog] Failed to load canonical System products from Supabase: ${error.message}.`,
    );
  }

  return ((data ?? []) as unknown as ProductRow[]).map(mapProductRow);
}
