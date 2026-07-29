import {
  normalizeProductPdpContent,
  type ProductPdpContentRow,
} from "@/lib/catalog/product-content";
import {
  CORE_ROUTINE_PRODUCT_SLUGS,
  type CoreRoutineContentSummary,
  type IngredientIndexProduct,
  type OfferAvailability,
  type PdpProductContent,
  type ProductCardContent,
  type ProductMetadata,
  type ProductOffer,
  type ProductRoute,
} from "@/lib/catalog/models";
import {
  type CommerceRoutineGroup,
  type ProductMedia,
  type ProductStatus,
} from "@/lib/products";
import { PDP_DISCOVERY_PRODUCT_LIMIT } from "@/lib/merchandising";
import { getSupabaseClient } from "@/lib/supabase";

type VariantRow = {
  variant_key: string;
  label: string;
  price_cents: number;
  available: boolean;
  inventory_status: string;
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

type RoutineRow = {
  routine_group?: string | null;
  routine_group_label?: string | null;
  routine_step_number?: number | null;
  routine_step_name?: string | null;
  routine_display_label?: string | null;
  routine_sort?: number | null;
};

type ProductCardRow = RoutineRow & {
  id: string;
  slug: string;
  name: string;
  display_name: string | null;
  tagline: string;
  card_tagline: string | null;
  collection: string;
  product_type: string | null;
  volume: string | null;
  usage_time: string[] | null;
  sort_order: number | null;
  position: number | null;
  created_at: string;
  swatch_from: string;
  swatch_to: string;
  product_media: MediaRow[] | null;
};

type PdpProductRow = RoutineRow & {
  id: string;
  slug: string;
  name: string;
  display_name: string | null;
  tagline: string;
  card_tagline: string | null;
  collection: string;
  routine_number: string | null;
  product_type: string | null;
  description: string;
  editorial_description: string | null;
  how_to_use: string;
  editorial_how_to_use: string | null;
  swatch_from: string;
  swatch_to: string;
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
  usage_time: string[] | null;
  product_pdp_content:
    | ProductPdpContentRow
    | ProductPdpContentRow[]
    | null;
  product_media: MediaRow[] | null;
};

type CoreRoutineRow = {
  id: string;
  slug: string;
  name: string;
  display_name: string | null;
  formal_title: string | null;
  product_type: string | null;
  card_tagline: string | null;
  tagline: string;
  description: string;
  editorial_description: string | null;
  benefits: string[] | null;
  good_for: string | null;
  texture: string | null;
  finish: string | null;
  key_ingredients: string[] | null;
  routine_step_number: number | null;
  routine_step_name: string | null;
  routine_sort: number | null;
  swatch_from: string;
  swatch_to: string;
  product_pdp_content:
    | ProductPdpContentRow
    | ProductPdpContentRow[]
    | null;
  product_media: MediaRow[] | null;
};

type ProductOfferRow = {
  id: string;
  slug: string;
  currency: string | null;
  status: string;
  product_variants: VariantRow[] | null;
};

type ProductMetadataRow = {
  slug: string;
  name: string;
  formal_title: string | null;
  tagline: string;
  card_tagline: string | null;
  seo_title: string | null;
  seo_description: string | null;
};

type IngredientIndexRow = {
  slug: string;
  name: string;
  display_name: string | null;
  key_ingredients: string[] | null;
  ingredients: string | null;
  formula_notes: string[] | null;
};

const OFFER_SELECT =
  "variant_key, label, price_cents, available, inventory_status, volume, pack_count, position, sort_order";
const MEDIA_SELECT =
  "media_type, media_kind, url, alt, width, height, role, sort_order, palette_id, placeholder_palette";
const ROUTINE_SELECT =
  "routine_group, routine_group_label, routine_step_number, routine_step_name, routine_display_label, routine_sort";
const PDP_CONTENT_SELECT =
  "schema_version, profile_title_tokens, routine_overlay, outcome_heading, outcome_labels, " +
  "how_to_use_steps, application_steps, ingredient_cards, ingredient_story, routine_guidance";

const CARD_MEDIA_ROLES = [
  "card_default",
  "card",
  "card_hover",
  "detail",
  "hero",
  "cart",
] as const;

const PDP_MEDIA_ROLES = [
  "card_default",
  "card",
  "detail",
  "hero",
  "gallery",
  "cart",
  "routine_video",
  "routine_video_poster",
  "profile_editorial",
  "ingredients_texture",
  "pdp_outcome",
  "pdp_application",
] as const;

const CORE_MEDIA_ROLES = [
  "card_default",
  "card",
  "detail",
  "hero",
  "cart",
  "core_routine_texture",
] as const;

const PRODUCT_CARD_SELECT_BASE =
  "id, slug, name, display_name, tagline, card_tagline, collection, product_type, " +
  "volume, usage_time, sort_order, position, created_at, swatch_from, swatch_to, " +
  `product_media ( ${MEDIA_SELECT} )`;

export const PRODUCT_CARD_SELECT = PRODUCT_CARD_SELECT_BASE.replace(
  "volume, usage_time",
  `${ROUTINE_SELECT}, volume, usage_time`,
);

const PDP_PRODUCT_SELECT_BASE =
  "id, slug, name, display_name, tagline, card_tagline, collection, " +
  "routine_number, product_type, description, editorial_description, how_to_use, " +
  "editorial_how_to_use, swatch_from, swatch_to, made_for, good_for, texture, " +
  "key_ingredients, ingredients, product_details, cautions, finish, volume, skin_types, " +
  "usage_time, " +
  `product_pdp_content ( ${PDP_CONTENT_SELECT} ), product_media ( ${MEDIA_SELECT} )`;

export const PDP_PRODUCT_SELECT = PDP_PRODUCT_SELECT_BASE.replace(
  "product_type, description",
  `${ROUTINE_SELECT}, product_type, description`,
);

export const CORE_ROUTINE_SUMMARY_SELECT =
  "id, slug, name, display_name, formal_title, product_type, card_tagline, tagline, " +
  "description, editorial_description, benefits, good_for, texture, finish, key_ingredients, " +
  "routine_step_number, routine_step_name, routine_sort, swatch_from, swatch_to, " +
  `product_pdp_content ( ${PDP_CONTENT_SELECT} ), product_media!inner ( ${MEDIA_SELECT} )`;

export const PRODUCT_OFFER_SELECT =
  `id, slug, currency, status, product_variants ( ${OFFER_SELECT} )`;

export const PRODUCT_METADATA_SELECT =
  "slug, name, formal_title, tagline, card_tagline, seo_title, seo_description";

export const PRODUCT_ROUTE_SELECT = "slug";

export const INGREDIENT_INDEX_SELECT =
  "slug, name, display_name, key_ingredients, ingredients, formula_notes";

const VALID_STATUSES: ProductStatus[] = ["available", "coming_soon", "sold_out"];
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

function toInventoryStatus(
  value: string,
): OfferAvailability["inventoryStatus"] {
  return (VALID_INVENTORY_STATUSES as readonly string[]).includes(value)
    ? (value as OfferAvailability["inventoryStatus"])
    : "in_stock";
}

function toRoutineGroup(value: string | null | undefined): CommerceRoutineGroup | null {
  return value === "core" || value === "beyond_core" ? value : null;
}

function isMissingRoutineColumn(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("routine_group") ||
    message.includes("routine_step_number") ||
    message.includes("routine_display_label") ||
    message.includes("routine_sort")
  );
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

function mediaRole(role: string): ProductMedia["role"] {
  switch (role) {
    case "card":
    case "hero":
    case "gallery":
    case "detail":
    case "card_default":
    case "card_hover":
    case "cart":
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

function mapMedia(
  rows: MediaRow[] | null,
  swatch: [string, string],
): ProductMedia[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => ({
      kind:
        row.media_kind === "placeholder"
          ? "placeholder"
          : row.media_type === "video"
            ? "video"
            : "image",
      url: row.url,
      alt: row.alt,
      width: row.width ?? null,
      height: row.height ?? null,
      role: mediaRole(row.role),
      sortOrder: row.sort_order,
      paletteId: row.palette_id ?? null,
      palette:
        row.media_kind === "placeholder"
          ? toPalette(row.placeholder_palette, swatch)
          : null,
    }));
}

function presentationMedia(media: ProductMedia[]) {
  return media.filter((item) => item.kind !== "video");
}

function selectCardMedia(media: ProductMedia[]) {
  const candidates = presentationMedia(media);
  return (
    candidates.find((item) => item.role === "card_default") ??
    candidates.find((item) => item.role === "card") ??
    candidates.find((item) => item.role === "detail") ??
    candidates.find((item) => item.role === "hero") ??
    null
  );
}

function selectDetailMedia(media: ProductMedia[], cardMedia: ProductMedia | null) {
  const candidates = presentationMedia(media);
  return (
    candidates.find((item) => item.role === "detail") ??
    candidates.find((item) => item.role === "hero") ??
    cardMedia
  );
}

function selectCartMedia(media: ProductMedia[], cardMedia: ProductMedia | null) {
  return (
    presentationMedia(media).find((item) => item.role === "cart") ?? cardMedia
  );
}

function mapOffers(
  product: { id: string; slug: string; status: string },
  rows: VariantRow[] | null,
): OfferAvailability[] {
  const productStatus = toStatus(product.status);
  return (rows ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? a.position) - (b.sort_order ?? b.position))
    .map((row) => ({
      productId: product.id,
      productSlug: product.slug,
      productStatus,
      id: row.variant_key,
      label: row.label,
      price: row.price_cents,
      available: row.available ?? true,
      inventoryStatus: toInventoryStatus(row.inventory_status),
      volume: row.volume ?? null,
      packCount: row.pack_count ?? null,
      sortOrder: row.sort_order ?? row.position,
    }));
}

function firstPdpContent(
  value: ProductPdpContentRow | ProductPdpContentRow[] | null,
): ProductPdpContentRow | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export function mapProductOfferRow(row: ProductOfferRow): ProductOffer {
  return {
    id: row.id,
    slug: row.slug,
    currency: row.currency === "USD" ? "USD" : "USD",
    status: toStatus(row.status),
    variants: mapOffers(row, row.product_variants),
  };
}

export function mapProductCardRow(row: ProductCardRow): ProductCardContent {
  const swatch: [string, string] = [row.swatch_from, row.swatch_to];
  const media = mapMedia(row.product_media, swatch);
  const cardMedia = selectCardMedia(media);
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name ?? row.name,
    cardTagline: row.card_tagline ?? row.tagline,
    collection: row.collection,
    productType: row.product_type ?? row.collection,
    volume: row.volume,
    usageTime: row.usage_time ?? [],
    routineGroup: toRoutineGroup(row.routine_group),
    routineGroupLabel: row.routine_group_label ?? null,
    routineDisplayLabel: row.routine_display_label ?? null,
    routineSort: row.routine_sort ?? null,
    sortOrder: row.sort_order ?? row.position ?? 0,
    createdAt: row.created_at,
    swatch,
    cardMedia,
    cardHoverMedia:
      presentationMedia(media).find((item) => item.role === "card_hover") ??
      cardMedia,
    cartMedia: selectCartMedia(media, cardMedia),
  };
}

export function mapPdpProductRow(row: PdpProductRow): PdpProductContent {
  const swatch: [string, string] = [row.swatch_from, row.swatch_to];
  const media = mapMedia(row.product_media, swatch);
  const cardMedia = selectCardMedia(media);
  const description = row.editorial_description ?? row.description;
  const howToUse = row.editorial_how_to_use ?? row.how_to_use;
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name ?? row.name,
    cardTagline: row.card_tagline ?? row.tagline,
    collection: row.collection,
    routineNumber: row.routine_number ?? null,
    routineGroup: toRoutineGroup(row.routine_group),
    routineGroupLabel: row.routine_group_label ?? null,
    routineStepNumber: row.routine_step_number ?? null,
    routineStepName: row.routine_step_name ?? null,
    routineDisplayLabel: row.routine_display_label ?? null,
    productType: row.product_type ?? row.collection,
    description,
    howToUse,
    swatch,
    media,
    cardMedia,
    detailMedia: selectDetailMedia(media, cardMedia),
    cartMedia: selectCartMedia(media, cardMedia),
    madeFor: row.made_for,
    goodFor: row.good_for,
    texture: row.texture,
    keyIngredients: row.key_ingredients ?? [],
    ingredients: row.ingredients,
    productDetails: row.product_details ?? {},
    cautions: row.cautions ?? [],
    finish: row.finish,
    volume: row.volume,
    skinTypes: row.skin_types ?? [],
    usageTime: row.usage_time ?? [],
    pdpContent: normalizeProductPdpContent(
      firstPdpContent(row.product_pdp_content),
      row.slug,
    ),
  };
}

export function mapCoreRoutineRow(
  row: CoreRoutineRow,
): CoreRoutineContentSummary {
  const swatch: [string, string] = [row.swatch_from, row.swatch_to];
  const media = mapMedia(row.product_media, swatch);
  const textureRows = media.filter(
    (item) => item.role === "core_routine_texture",
  );
  const textureMedia = textureRows[0];
  if (
    textureRows.length !== 1 ||
    !textureMedia ||
    textureMedia.kind !== "image" ||
    !textureMedia.url ||
    !textureMedia.alt.trim() ||
    !textureMedia.width ||
    !textureMedia.height ||
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
  const cardMedia = selectCardMedia(media);
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name ?? row.name,
    formalTitle: row.formal_title ?? row.name,
    productType: row.product_type ?? row.name,
    cardTagline: row.card_tagline ?? row.tagline,
    description: row.editorial_description ?? row.description,
    benefits: row.benefits ?? [],
    goodFor: row.good_for,
    texture: row.texture,
    finish: row.finish,
    keyIngredients: row.key_ingredients ?? [],
    routineGroup: "core",
    routineStepNumber: row.routine_step_number,
    routineStepName: row.routine_step_name,
    routineSort: row.routine_sort,
    swatch,
    textureMedia,
    cardMedia,
    cartMedia: selectCartMedia(media, cardMedia),
    pdpContent: normalizeProductPdpContent(
      firstPdpContent(row.product_pdp_content),
      row.slug,
    ),
  };
}

function withMediaOrdering<
  T extends {
    order: (
      column: string,
      options?: {
        ascending?: boolean;
        nullsFirst?: boolean;
        referencedTable?: string;
      },
    ) => T;
  },
>(query: T): T {
  return query
    .order("sort_order", {
      referencedTable: "product_media",
      ascending: true,
    });
}

function withOfferOrdering<
  T extends {
    order: (
      column: string,
      options?: {
        ascending?: boolean;
        nullsFirst?: boolean;
        referencedTable?: string;
      },
    ) => T;
  },
>(query: T): T {
  return query
    .order("sort_order", {
      referencedTable: "product_variants",
      ascending: true,
      nullsFirst: false,
    })
    .order("position", {
      referencedTable: "product_variants",
      ascending: true,
    });
}

export async function getProductCardContents(): Promise<
  ProductCardContent[]
> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("catalog_status", "active")
    .in("product_media.role", [...CARD_MEDIA_ROLES])
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true });
  let { data, error } = await withMediaOrdering(query);

  if (error && isMissingRoutineColumn(error)) {
    query = supabase
      .from("products")
      .select(PRODUCT_CARD_SELECT_BASE)
      .eq("catalog_status", "active")
      .in("product_media.role", [...CARD_MEDIA_ROLES])
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("position", { ascending: true });
    const legacy = await withMediaOrdering(query);
    data = legacy.data;
    error = legacy.error;
  }

  if (error) {
    throw new Error(
      `[catalog] Failed to load product cards from Supabase: ${error.message}.`,
    );
  }

  return ((data ?? []) as unknown as ProductCardRow[]).map(mapProductCardRow);
}

export async function getPdpProductContent(
  slug: string,
): Promise<PdpProductContent | undefined> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("products")
    .select(PDP_PRODUCT_SELECT)
    .eq("slug", slug)
    .eq("catalog_status", "active")
    .in("product_media.role", [...PDP_MEDIA_ROLES]);
  let { data, error } = await withMediaOrdering(query).maybeSingle();

  if (error && isMissingRoutineColumn(error)) {
    query = supabase
      .from("products")
      .select(PDP_PRODUCT_SELECT_BASE)
      .eq("slug", slug)
      .eq("catalog_status", "active")
      .in("product_media.role", [...PDP_MEDIA_ROLES]);
    const legacy = await withMediaOrdering(query).maybeSingle();
    data = legacy.data;
    error = legacy.error;
  }

  if (error) {
    throw new Error(
      `[catalog] Failed to load PDP product "${slug}" from Supabase: ${error.message}.`,
    );
  }
  if (!data) return undefined;
  return mapPdpProductRow(data as unknown as PdpProductRow);
}

export async function getProductOffers(): Promise<ProductOffer[]> {
  const query = getSupabaseClient()
    .from("products")
    .select(PRODUCT_OFFER_SELECT)
    .eq("catalog_status", "active")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true });
  const { data, error } = await withOfferOrdering(query);

  if (error) {
    throw new Error(
      `[catalog] Failed to load product offers from Supabase: ${error.message}.`,
    );
  }

  return ((data ?? []) as unknown as ProductOfferRow[]).map(
    mapProductOfferRow,
  );
}

export async function getProductOffer(
  slug: string,
): Promise<ProductOffer | undefined> {
  const query = getSupabaseClient()
    .from("products")
    .select(PRODUCT_OFFER_SELECT)
    .eq("slug", slug)
    .eq("catalog_status", "active");
  const { data, error } = await withOfferOrdering(query).maybeSingle();

  if (error) {
    throw new Error(
      `[catalog] Failed to load product offer "${slug}" from Supabase: ${error.message}.`,
    );
  }

  return data
    ? mapProductOfferRow(data as unknown as ProductOfferRow)
    : undefined;
}

export async function getProductMetadata(
  slug: string,
): Promise<ProductMetadata | undefined> {
  const { data, error } = await getSupabaseClient()
    .from("products")
    .select(PRODUCT_METADATA_SELECT)
    .eq("slug", slug)
    .eq("catalog_status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(
      `[catalog] Failed to load product metadata for "${slug}": ${error.message}.`,
    );
  }
  if (!data) return undefined;
  const row = data as unknown as ProductMetadataRow;
  return {
    slug: row.slug,
    formalTitle: row.formal_title ?? row.name,
    cardTagline: row.card_tagline ?? row.tagline,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  };
}

export async function getProductRoutes(): Promise<ProductRoute[]> {
  const { data, error } = await getSupabaseClient()
    .from("products")
    .select(PRODUCT_ROUTE_SELECT)
    .eq("catalog_status", "active")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true });

  if (error) {
    throw new Error(
      `[catalog] Failed to load product routes from Supabase: ${error.message}.`,
    );
  }

  return (data ?? []) as ProductRoute[];
}

export async function getDiscoveryProductCardContents(
  excludeSlug: string,
  limit = PDP_DISCOVERY_PRODUCT_LIMIT,
): Promise<ProductCardContent[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("catalog_status", "active")
    .neq("slug", excludeSlug)
    .in("product_media.role", [...CARD_MEDIA_ROLES])
    .order("routine_sort", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true })
    .limit(limit);
  let { data, error } = await withMediaOrdering(query);

  if (error && isMissingRoutineColumn(error)) {
    query = supabase
      .from("products")
      .select(PRODUCT_CARD_SELECT_BASE)
      .eq("catalog_status", "active")
      .neq("slug", excludeSlug)
      .in("product_media.role", [...CARD_MEDIA_ROLES])
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("position", { ascending: true })
      .limit(limit);
    const legacy = await withMediaOrdering(query);
    data = legacy.data;
    error = legacy.error;
  }

  if (error) {
    throw new Error(
      `[catalog] Failed to load discovery products for "${excludeSlug}": ${error.message}.`,
    );
  }

  return ((data ?? []) as unknown as ProductCardRow[])
    .map(mapProductCardRow)
    .sort(
      (a, b) =>
        (a.routineSort ?? a.sortOrder) - (b.routineSort ?? b.sortOrder) ||
        a.displayName.localeCompare(b.displayName),
    )
    .slice(0, limit);
}

export async function getCoreRoutineContentSummaries(): Promise<
  CoreRoutineContentSummary[]
> {
  const query = getSupabaseClient()
    .from("products")
    .select(CORE_ROUTINE_SUMMARY_SELECT)
    .eq("catalog_status", "active")
    .in("slug", [...CORE_ROUTINE_PRODUCT_SLUGS])
    .in("product_media.role", [...CORE_MEDIA_ROLES])
    .order("routine_sort", { ascending: true, nullsFirst: false })
    .limit(CORE_ROUTINE_PRODUCT_SLUGS.length);
  const { data, error } = await withMediaOrdering(query);

  if (error) {
    throw new Error(
      `[catalog] Failed to load the Core routine from Supabase: ${error.message}.`,
    );
  }

  const products = ((data ?? []) as unknown as CoreRoutineRow[]).map(
    mapCoreRoutineRow,
  );
  const expectedSlugs = [...CORE_ROUTINE_PRODUCT_SLUGS];
  if (
    products.length !== expectedSlugs.length ||
    products.some(
      (product, index) =>
        product.slug !== expectedSlugs[index] ||
        product.routineStepNumber !== index + 1,
    )
  ) {
    throw new Error(
      "[catalog] Core routine unavailable: expected active CLEANSE, TREAT, and SEAL sequence with dedicated texture media.",
    );
  }

  return products;
}

export async function getIngredientIndexProducts(): Promise<
  IngredientIndexProduct[]
> {
  const { data, error } = await getSupabaseClient()
    .from("products")
    .select(INGREDIENT_INDEX_SELECT)
    .eq("catalog_status", "active")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true });

  if (error) {
    throw new Error(
      `[catalog] Failed to load ingredient index products: ${error.message}.`,
    );
  }

  return ((data ?? []) as unknown as IngredientIndexRow[]).map((row) => ({
    slug: row.slug,
    displayName: row.display_name ?? row.name,
    keyIngredients: row.key_ingredients ?? [],
    ingredients: row.ingredients,
    formulaNotes: row.formula_notes ?? [],
  }));
}
