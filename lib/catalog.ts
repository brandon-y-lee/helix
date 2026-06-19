// Typed catalog data-access layer.
//
// Supabase is the required catalog source — there is no static fallback. A
// missing configuration or a failed query throws a clear, developer-facing
// error so misconfiguration fails fast instead of silently degrading. An empty
// (but reachable) catalog returns no products, and the storefront renders an
// explicit empty state.

import { getSupabaseClient } from "@/lib/supabase";
import type {
  CatalogStatus,
  Product,
  ProductMedia,
  ProductStatus,
  Variant,
} from "@/lib/products";

export { formatPrice } from "@/lib/products";
export type { Product, ProductStatus, Variant } from "@/lib/products";

// Shape returned by the Supabase query (snake_case columns + joined variants).
type ProductRow = {
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
  subtitle: string | null;
  descriptor: string | null;
  product_type: string | null;
  badge: string | null;
  currency: string | null;
  featured_rank: number | null;
  sort_order: number | null;
  position: number | null;
  blurb: string;
  description: string;
  editorial_description: string | null;
  benefits: string[] | null;
  how_to_use: string;
  editorial_how_to_use: string | null;
  formula_notes: string[] | null;
  swatch_from: string;
  swatch_to: string;
  status: string;
  catalog_status: string;
  made_for: string | null;
  good_for: string | null;
  texture: string | null;
  key_ingredients: string[] | null;
  ingredients: string | null;
  product_details: Record<string, string> | null;
  cautions: string[] | null;
  finish: string | null;
  volume: string | null;
  skin_types: string[] | null;
  concerns: string[] | null;
  routine_step: string | null;
  routine_order: number | null;
  usage_time: string[] | null;
  seo_title: string | null;
  seo_description: string | null;
  search_keywords: string[] | null;
  created_at: string;
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
  position: number;
  sort_order: number | null;
};

type MediaRow = {
  media_kind: string | null;
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
  "id, slug, name, display_name, formal_title, tagline, card_tagline, collection, " +
  "action_name, routine_number, subtitle, descriptor, product_type, badge, currency, " +
  "featured_rank, sort_order, position, blurb, description, editorial_description, " +
  "benefits, how_to_use, editorial_how_to_use, formula_notes, swatch_from, swatch_to, status, " +
  "catalog_status, made_for, good_for, texture, key_ingredients, ingredients, " +
  "product_details, cautions, finish, volume, skin_types, concerns, routine_step, " +
  "routine_order, usage_time, seo_title, seo_description, search_keywords, created_at, " +
  "product_variants ( variant_key, label, price_cents, compare_at_price_cents, sku, " +
  "available, inventory_status, option_values, volume, pack_count, position, sort_order ), " +
  "product_media ( media_kind, url, alt, width, height, role, sort_order, palette_id, placeholder_palette )";

const VALID_STATUSES: ProductStatus[] = ["available", "coming_soon", "sold_out"];
const VALID_CATALOG_STATUSES: CatalogStatus[] = ["active", "draft", "archived"];
const VALID_INVENTORY_STATUSES = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "unavailable",
] as const;

function toStatus(value: string): ProductStatus {
  return (VALID_STATUSES as string[]).includes(value)
    ? (value as ProductStatus)
    : "available";
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

function toStringRecord(value: Record<string, string> | null | undefined) {
  return value ?? {};
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function toPalette(
  value: Record<string, string> | null | undefined,
  fallback: [string, string],
): ProductMedia["palette"] {
  if (!value) return { start: fallback[0], end: fallback[1] };
  return {
    start: isHex(value.start) ? value.start : fallback[0],
    end: isHex(value.end) ? value.end : fallback[1],
    accent: isHex(value.accent) ? value.accent : undefined,
    surface: isHex(value.surface) ? value.surface : undefined,
    ink: isHex(value.ink) ? value.ink : undefined,
    highlight: isHex(value.highlight) ? value.highlight : undefined,
  };
}

function mapRow(row: ProductRow): Product {
  const swatch: [string, string] = [row.swatch_from, row.swatch_to];
  const variants: Variant[] = (row.product_variants ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? a.position) - (b.sort_order ?? b.position))
    .map((v) => ({
      id: v.variant_key,
      label: v.label,
      price: v.price_cents,
      compareAtPrice: v.compare_at_price_cents ?? null,
      sku: v.sku ?? null,
      available: v.available ?? true,
      inventoryStatus: toInventoryStatus(v.inventory_status),
      volume: v.volume ?? null,
      packCount: v.pack_count ?? null,
      optionValues: toStringRecord(v.option_values),
      sortOrder: v.sort_order ?? v.position,
    }));

  const media: ProductMedia[] = (row.product_media ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({
      kind: m.media_kind === "placeholder" ? "placeholder" : "image",
      url: m.url,
      alt: m.alt,
      width: m.width ?? null,
      height: m.height ?? null,
      role: ProductMediaRoleFromRow(m.role),
      sortOrder: m.sort_order,
      paletteId: m.palette_id ?? null,
      palette:
        m.media_kind === "placeholder"
          ? toPalette(m.placeholder_palette, swatch)
          : null,
    }));

  const cardMedia =
    media.find((m) => m.role === "card_default") ??
    media.find((m) => m.role === "card") ??
    media[0] ??
    null;
  const cardHoverMedia =
    media.find((m) => m.role === "card_hover") ?? cardMedia ?? null;
  const heroMedia =
    media.find((m) => m.role === "detail") ??
    media.find((m) => m.role === "hero") ??
    cardMedia ??
    media[0] ??
    null;
  const detailMedia =
    media.find((m) => m.role === "detail") ?? heroMedia ?? cardMedia ?? null;
  const cartMedia =
    media.find((m) => m.role === "cart") ?? cardMedia ?? media[0] ?? null;
  const searchMedia =
    media.find((m) => m.role === "search") ?? cardMedia ?? media[0] ?? null;
  const displayName = row.display_name ?? row.name;
  const formalTitle = row.formal_title ?? row.name;
  const cardTagline = row.card_tagline ?? row.tagline;
  const editorialDescription = row.editorial_description ?? row.description;
  const editorialHowToUse = row.editorial_how_to_use ?? row.how_to_use;

  return {
    id: row.id,
    slug: row.slug,
    displayName,
    formalTitle,
    name: displayName,
    tagline: row.tagline,
    cardTagline,
    collection: row.collection,
    actionName: row.action_name ?? null,
    routineNumber: row.routine_number ?? null,
    subtitle: row.subtitle ?? row.tagline,
    descriptor: row.descriptor ?? editorialDescription,
    productType: row.product_type ?? row.collection,
    badge: row.badge ?? null,
    currency: row.currency === "USD" ? "USD" : "USD",
    featuredRank: row.featured_rank ?? row.position ?? null,
    sortOrder: row.sort_order ?? row.position ?? 0,
    blurb: row.blurb,
    description: editorialDescription,
    editorialDescription,
    benefits: row.benefits ?? [],
    howToUse: editorialHowToUse,
    editorialHowToUse,
    formulaNotes: row.formula_notes ?? [],
    variants,
    swatch,
    media,
    cardMedia,
    cardHoverMedia,
    heroMedia,
    detailMedia,
    cartMedia,
    searchMedia,
    status: toStatus(row.status),
    catalogStatus: toCatalogStatus(row.catalog_status),
    madeFor: row.made_for,
    goodFor: row.good_for,
    texture: row.texture,
    keyIngredients: row.key_ingredients ?? [],
    ingredients: row.ingredients ?? null,
    productDetails: toStringRecord(row.product_details),
    cautions: row.cautions ?? [],
    finish: row.finish,
    volume: row.volume,
    skinTypes: row.skin_types ?? [],
    concerns: row.concerns ?? [],
    routineStep: row.routine_step,
    routineOrder: row.routine_order,
    usageTime: row.usage_time ?? [],
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    searchKeywords: row.search_keywords ?? [],
    createdAt: row.created_at,
  };
}

function ProductMediaRoleFromRow(role: string): ProductMedia["role"] {
  switch (role) {
    case "card":
    case "hero":
    case "gallery":
    case "detail":
    case "campaign":
    case "card_default":
    case "card_hover":
    case "cart":
    case "search":
      return role;
    default:
      return "gallery";
  }
}

export async function getProducts(): Promise<Product[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true });

  if (error) {
    throw new Error(
      `[catalog] Failed to load products from Supabase: ${error.message}. ` +
        `Ensure the catalog schema and seed (migrations "catalog" and "seed_catalog") ` +
        `are applied to the project.`,
    );
  }

  // Reachable but empty → return no products; pages render an empty state.
  return (data as unknown as ProductRow[]).map(mapRow);
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[catalog] Failed to load product "${slug}" from Supabase: ${error.message}. ` +
        `Ensure the catalog schema and seed are applied to the project.`,
    );
  }

  // No row for this slug → genuine not-found (caller renders 404).
  if (!data) return undefined;

  return mapRow(data as unknown as ProductRow);
}

/**
 * Products in the same collection, excluding the current one — the "complete
 * the routine" rail on the PDP. Returns up to `limit` products.
 */
export async function getRelatedProducts(
  collection: string,
  excludeSlug: string,
  limit = 4,
): Promise<Product[]> {
  const supabase = getSupabaseClient();

  const { data: current, error: currentError } = await supabase
    .from("products")
    .select("id")
    .eq("slug", excludeSlug)
    .maybeSingle();

  if (currentError) {
    throw new Error(
      `[catalog] Failed to load related products for "${excludeSlug}": ${currentError.message}.`,
    );
  }

  if (current?.id) {
    const { data: relationships, error: relationshipError } = await supabase
      .from("product_relationships")
      .select(
        `sort_order, related_product:products!product_relationships_related_product_id_fkey ( ${PRODUCT_SELECT} )`,
      )
      .eq("product_id", current.id)
      .eq("relationship_type", "complete_the_routine")
      .order("sort_order", { ascending: true })
      .limit(limit);

    if (relationshipError) {
      throw new Error(
        `[catalog] Failed to load routine relationships for "${excludeSlug}": ${relationshipError.message}.`,
      );
    }

    const related = (relationships as unknown as ProductRelationshipRow[])
      .map((row) => firstProduct(row.related_product))
      .filter((row): row is ProductRow => Boolean(row))
      .map(mapRow);

    if (related.length > 0) return related;
  }

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("collection", collection)
    .neq("slug", excludeSlug)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(
      `[catalog] Failed to load related products for "${collection}": ${error.message}.`,
    );
  }

  return (data as unknown as ProductRow[]).map(mapRow);
}

type ProductRelationshipRow = {
  sort_order: number;
  related_product: ProductRow | ProductRow[] | null;
};

function firstProduct(value: ProductRow | ProductRow[] | null): ProductRow | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
