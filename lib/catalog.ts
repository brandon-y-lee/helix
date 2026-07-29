// Typed catalog data-access layer.
//
// Supabase is the required catalog source — there is no static fallback. A
// missing configuration or a failed query throws a clear, developer-facing
// error so misconfiguration fails fast instead of silently degrading. An empty
// (but reachable) catalog returns no products, and the storefront renders an
// explicit empty state.

import { getSupabaseClient } from "@/lib/supabase";
import { productRoutineForSlug } from "@/lib/catalog/product-routine";
import type {
  CatalogStatus,
  CommerceRoutineGroup,
  CoreRoutineProduct,
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
  routine_group?: string | null;
  routine_group_label?: string | null;
  routine_step_number?: number | null;
  routine_step_name?: string | null;
  routine_display_label?: string | null;
  routine_sort?: number | null;
  legacy_routine_group_label?: string | null;
  legacy_routine_display_label?: string | null;
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
  media_type: string | null;
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

type CoreRoutineRow = {
  id: string;
  slug: string;
  display_name: string | null;
  formal_title: string | null;
  name: string;
  product_type: string | null;
  routine_step_number: number | null;
  routine_step_name: string | null;
  routine_sort: number | null;
  swatch_from: string;
  swatch_to: string;
  product_media: MediaRow[] | null;
};

const PRODUCT_SELECT_BASE =
  "id, slug, name, display_name, formal_title, tagline, card_tagline, collection, " +
  "action_name, routine_number, subtitle, descriptor, product_type, badge, currency, " +
  "featured_rank, sort_order, position, blurb, description, editorial_description, " +
  "benefits, how_to_use, editorial_how_to_use, formula_notes, swatch_from, swatch_to, status, " +
  "catalog_status, made_for, good_for, texture, key_ingredients, ingredients, " +
  "product_details, cautions, finish, volume, skin_types, concerns, routine_step, " +
  "routine_order, usage_time, seo_title, seo_description, search_keywords, created_at, " +
  "product_variants ( variant_key, label, price_cents, compare_at_price_cents, sku, " +
  "available, inventory_status, option_values, volume, pack_count, position, sort_order ), " +
  "product_media ( media_type, media_kind, url, alt, width, height, role, sort_order, palette_id, placeholder_palette )";

const PRODUCT_ROUTINE_SELECT =
  "routine_group, routine_group_label, routine_step_number, routine_step_name, " +
  "routine_display_label, routine_sort, legacy_routine_group_label, legacy_routine_display_label";

const PRODUCT_SELECT = PRODUCT_SELECT_BASE.replace(
  "subtitle, descriptor",
  `${PRODUCT_ROUTINE_SELECT}, subtitle, descriptor`,
);

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

function toCommerceRoutineGroup(value: string | null): CommerceRoutineGroup | null {
  return value === "core" || value === "beyond_core" ? value : null;
}

function isMissingRoutineColumn(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("routine_group") ||
    message.includes("routine_step_number") ||
    message.includes("routine_display_label") ||
    message.includes("routine_sort") ||
    message.includes("legacy_routine")
  );
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
      kind:
        m.media_kind === "placeholder"
          ? "placeholder"
          : m.media_type === "video"
            ? "video"
            : "image",
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
    presentationMedia.find((m) => m.role === "card_default") ??
    presentationMedia.find((m) => m.role === "card") ??
    presentationMedia.find((m) => m.role === "detail") ??
    presentationMedia.find((m) => m.role === "hero") ??
    null;
  const cardHoverMedia =
    presentationMedia.find((m) => m.role === "card_hover") ?? cardMedia ?? null;
  const heroMedia =
    presentationMedia.find((m) => m.role === "detail") ??
    presentationMedia.find((m) => m.role === "hero") ??
    cardMedia ??
    null;
  const detailMedia =
    presentationMedia.find((m) => m.role === "detail") ??
    heroMedia ??
    cardMedia ??
    null;
  const cartMedia =
    presentationMedia.find((m) => m.role === "cart") ?? cardMedia ?? null;
  const searchMedia =
    presentationMedia.find((m) => m.role === "search") ?? cardMedia ?? null;
  const displayName = row.display_name ?? row.name;
  const formalTitle = row.formal_title ?? row.name;
  const cardTagline = row.card_tagline ?? row.tagline;
  const editorialDescription = row.editorial_description ?? row.description;
  const editorialHowToUse = row.editorial_how_to_use ?? row.how_to_use;
  const routine = productRoutineForSlug(row.slug);

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
    routineGroup: toCommerceRoutineGroup(
      row.routine_group ?? routine?.routineGroup ?? null,
    ),
    routineGroupLabel: row.routine_group_label ?? routine?.routineGroupLabel ?? null,
    routineStepNumber: row.routine_step_number ?? routine?.routineStepNumber ?? null,
    routineStepName: row.routine_step_name ?? routine?.routineStepName ?? null,
    routineDisplayLabel:
      row.routine_display_label ?? routine?.routineDisplayLabel ?? null,
    routineSort: row.routine_sort ?? routine?.routineSort ?? null,
    legacyRoutineGroupLabel:
      row.legacy_routine_group_label ?? routine?.legacyRoutineGroupLabel ?? null,
    legacyRoutineDisplayLabel:
      row.legacy_routine_display_label ?? routine?.legacyRoutineDisplayLabel ?? null,
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
    case "routine_video":
    case "routine_video_poster":
    case "profile_editorial":
    case "ingredients_texture":
    case "core_routine_texture":
    case "pdp_outcome":
    case "pdp_application":
      return role;
    default:
      return "gallery";
  }
}

const CORE_ROUTINE_SELECT =
  "id, slug, name, display_name, formal_title, product_type, routine_step_number, " +
  "routine_step_name, routine_sort, swatch_from, swatch_to, " +
  "product_media!inner ( media_type, media_kind, url, alt, width, height, role, sort_order, palette_id, placeholder_palette )";

function mapCoreRoutineRow(row: CoreRoutineRow): CoreRoutineProduct {
  const mediaRows = (row.product_media ?? []).filter(
    (media) => media.role === "core_routine_texture",
  );
  const media = mediaRows[0];
  if (
    mediaRows.length !== 1 ||
    !media ||
    media.media_type !== "image" ||
    media.media_kind !== "image" ||
    !media.url ||
    !media.alt.trim() ||
    !media.width ||
    !media.height ||
    !row.routine_step_number ||
    !row.routine_step_name ||
    row.routine_sort === null ||
    !isHex(row.swatch_from) ||
    !isHex(row.swatch_to)
  ) {
    throw new Error(
      `[catalog] Core routine unavailable: "${row.slug}" is missing canonical routine metadata or texture media.`,
    );
  }

  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name ?? row.name,
    formalTitle: row.formal_title ?? row.name,
    productType: row.product_type ?? row.name,
    routineStepNumber: row.routine_step_number,
    routineStepName: row.routine_step_name,
    routineSort: row.routine_sort,
    swatch: [row.swatch_from, row.swatch_to],
    textureMedia: {
      kind: "image",
      url: media.url,
      alt: media.alt,
      width: media.width,
      height: media.height,
      role: "core_routine_texture",
      sortOrder: media.sort_order,
      paletteId: media.palette_id ?? null,
      palette: null,
    },
  };
}

export async function getCoreRoutineProducts(): Promise<CoreRoutineProduct[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(CORE_ROUTINE_SELECT)
    .eq("catalog_status", "active")
    .eq("routine_group", "core")
    .eq("product_media.role", "core_routine_texture")
    .order("routine_sort", { ascending: true, nullsFirst: false })
    .limit(4);

  if (error) {
    throw new Error(
      `[catalog] Failed to load the Core routine from Supabase: ${error.message}.`,
    );
  }

  const products = ((data ?? []) as unknown as CoreRoutineRow[]).map(
    mapCoreRoutineRow,
  );
  const steps = products.map((product) => product.routineStepNumber);
  const names = products.map((product) => product.displayName.toUpperCase());
  const uniqueSlugs = new Set(products.map((product) => product.slug));
  if (
    products.length !== 3 ||
    uniqueSlugs.size !== 3 ||
    steps.join(",") !== "1,2,3" ||
    names.join(",") !== "CLEANSE,TREAT,SEAL"
  ) {
    throw new Error(
      `[catalog] Core routine unavailable: expected active CLEANSE, TREAT, and SEAL sequence with dedicated texture media.`,
    );
  }

  return products;
}

export async function getProducts(): Promise<Product[]> {
  const supabase = getSupabaseClient();

  let { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true });

  if (error && isMissingRoutineColumn(error)) {
    const legacyResult = await supabase
      .from("products")
      .select(PRODUCT_SELECT_BASE)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("position", { ascending: true });
    data = legacyResult.data;
    error = legacyResult.error;
  }

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

  let { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (error && isMissingRoutineColumn(error)) {
    const legacyResult = await supabase
      .from("products")
      .select(PRODUCT_SELECT_BASE)
      .eq("slug", slug)
      .maybeSingle();
    data = legacyResult.data;
    error = legacyResult.error;
  }

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
    const relationshipResult = await supabase
      .from("product_relationships")
      .select(
        `sort_order, related_product:products!product_relationships_related_product_id_fkey ( ${PRODUCT_SELECT} )`,
      )
      .eq("product_id", current.id)
      .eq("relationship_type", "complete_the_routine")
      .order("sort_order", { ascending: true })
      .limit(limit);
    let relationships: unknown = relationshipResult.data;
    let relationshipError = relationshipResult.error;

    if (relationshipError && isMissingRoutineColumn(relationshipError)) {
      const legacyResult = await supabase
        .from("product_relationships")
        .select(
          `sort_order, related_product:products!product_relationships_related_product_id_fkey ( ${PRODUCT_SELECT_BASE} )`,
        )
        .eq("product_id", current.id)
        .eq("relationship_type", "complete_the_routine")
        .order("sort_order", { ascending: true })
        .limit(limit);
      relationships = legacyResult.data;
      relationshipError = legacyResult.error;
    }

    if (relationshipError) {
      throw new Error(
        `[catalog] Failed to load routine relationships for "${excludeSlug}": ${relationshipError.message}.`,
      );
    }

    const related = (relationships as ProductRelationshipRow[])
      .map((row) => firstProduct(row.related_product))
      .filter((row): row is ProductRow => Boolean(row))
      .map(mapRow);

    if (related.length > 0) return related;
  }

  let { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("collection", collection)
    .neq("slug", excludeSlug)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true })
    .limit(limit);

  if (error && isMissingRoutineColumn(error)) {
    const legacyResult = await supabase
      .from("products")
      .select(PRODUCT_SELECT_BASE)
      .eq("collection", collection)
      .neq("slug", excludeSlug)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("position", { ascending: true })
      .limit(limit);
    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) {
    throw new Error(
      `[catalog] Failed to load related products for "${collection}": ${error.message}.`,
    );
  }

  return (data as unknown as ProductRow[]).map(mapRow);
}

/**
 * Product discovery rail for commerce PDPs. It is intentionally not the
 * editorial System order: Core products sort first, then Beyond The Core.
 */
export async function getDiscoveryProducts(
  excludeSlug: string,
  limit = 6,
): Promise<Product[]> {
  const supabase = getSupabaseClient();

  let { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .neq("slug", excludeSlug)
    .order("routine_sort", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true })
    .limit(limit);

  if (error && isMissingRoutineColumn(error)) {
    const legacyResult = await supabase
      .from("products")
      .select(PRODUCT_SELECT_BASE)
      .neq("slug", excludeSlug)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("position", { ascending: true })
      .limit(limit);
    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) {
    throw new Error(
      `[catalog] Failed to load discovery products for "${excludeSlug}": ${error.message}.`,
    );
  }

  return (data as unknown as ProductRow[])
    .map(mapRow)
    .sort(
      (a, b) =>
        (a.routineSort ?? a.sortOrder) - (b.routineSort ?? b.sortOrder) ||
        a.displayName.localeCompare(b.displayName),
    )
    .slice(0, limit);
}

type ProductRelationshipRow = {
  sort_order: number;
  related_product: ProductRow | ProductRow[] | null;
};

function firstProduct(value: ProductRow | ProductRow[] | null): ProductRow | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
