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
import { PDP_DISCOVERY_PRODUCT_LIMIT } from "@/lib/catalog/discovery";
import {
  CORE_SYSTEM_STEPS,
  isCoreSystemStep,
  systemStepFromDatabaseRelation,
  type GovernedSystemStep,
  type SystemStepDatabaseRelation,
} from "@/lib/catalog/system-steps";
import { getSupabaseClient } from "@/lib/supabase";

type VariantRow = {
  variant_key: string;
  label: string;
  price_cents: number;
  available: boolean;
  inventory_status: string;
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

type RoutineRow = {
  routine_group: string;
  system_step_name: string | null;
  system_steps: SystemStepDatabaseRelation;
  routine_sort: number;
};

type ProductCardRow = RoutineRow & {
  id: string;
  slug: string;
  display_name: string;
  product_type: string;
  volume: string | null;
  usage_time: string[] | null;
  sort_order: number;
  created_at: string;
  swatch_from: string;
  swatch_to: string;
  product_media: MediaRow[] | null;
};

type PdpProductRow = RoutineRow & {
  id: string;
  slug: string;
  display_name: string;
  product_type: string;
  editorial_description: string;
  editorial_how_to_use: string;
  swatch_from: string;
  swatch_to: string;
  made_for: string | null;
  good_for: string | null;
  texture: string | null;
  key_ingredients: string[] | null;
  ingredients: string | null;
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
  display_name: string;
  product_type: string;
  editorial_description: string;
  benefits: string[] | null;
  good_for: string | null;
  texture: string | null;
  finish: string | null;
  key_ingredients: string[] | null;
  routine_group: string;
  system_step_name: string | null;
  system_steps: SystemStepDatabaseRelation;
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
  display_name: string;
  product_type: string;
  editorial_description: string;
  seo_title: string | null;
  seo_description: string | null;
};

type IngredientIndexRow = {
  slug: string;
  display_name: string;
  key_ingredients: string[] | null;
  ingredients: string | null;
  formula_notes: string[] | null;
};

const OFFER_SELECT =
  "variant_key, label, price_cents, available, inventory_status, volume, pack_count, sort_order";
const MEDIA_SELECT =
  "media_type, url, alt, width, height, role, sort_order, palette_id, placeholder_palette";
const ROUTINE_SELECT =
  "routine_group, system_step_name, system_steps ( name, position, routine_group ), routine_sort";
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
  "core_routine_editorial",
] as const;

const PRODUCT_CARD_SELECT =
  "id, slug, display_name, product_type, " +
  `${ROUTINE_SELECT}, volume, usage_time, sort_order, created_at, swatch_from, swatch_to, ` +
  `product_media ( ${MEDIA_SELECT} )`;

const PDP_PRODUCT_SELECT =
  "id, slug, display_name, product_type, " +
  `${ROUTINE_SELECT}, editorial_description, editorial_how_to_use, ` +
  "swatch_from, swatch_to, made_for, good_for, texture, " +
  "key_ingredients, ingredients, cautions, finish, volume, skin_types, usage_time, " +
  `product_pdp_content ( ${PDP_CONTENT_SELECT} ), product_media ( ${MEDIA_SELECT} )`;

const CORE_ROUTINE_SUMMARY_SELECT =
  "id, slug, display_name, product_type, " +
  "editorial_description, benefits, good_for, texture, finish, key_ingredients, " +
  `${ROUTINE_SELECT}, swatch_from, swatch_to, ` +
  `product_pdp_content ( ${PDP_CONTENT_SELECT} ), product_media!inner ( ${MEDIA_SELECT} )`;

const PRODUCT_OFFER_SELECT =
  `id, slug, currency, status, product_variants ( ${OFFER_SELECT} )`;

const PRODUCT_METADATA_SELECT =
  "slug, display_name, product_type, editorial_description, seo_title, seo_description";

const PRODUCT_ROUTE_SELECT = "slug";

const INGREDIENT_INDEX_SELECT =
  "slug, display_name, key_ingredients, ingredients, formula_notes";

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

function toRoutineGroup(value: string): CommerceRoutineGroup {
  if (value === "core" || value === "beyond_core") return value;
  throw new Error(`[catalog] Unsupported canonical routine group "${value}".`);
}

function requireSystemStep(row: {
  slug: string;
  routine_group: string;
  system_step_name: string | null;
  system_steps: SystemStepDatabaseRelation;
}): GovernedSystemStep {
  const routineGroup = toRoutineGroup(row.routine_group);
  const systemStep = systemStepFromDatabaseRelation(row.system_steps);
  if (
    !systemStep ||
    systemStep.name !== row.system_step_name ||
    systemStep.routineGroup !== routineGroup
  ) {
    throw new Error(`[catalog] Active Product ${row.slug} has no System Step.`);
  }
  return systemStep;
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
    case "core_routine_editorial":
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
        row.media_type === "video"
          ? "video"
          : row.url
            ? "image"
            : "placeholder",
      url: row.url,
      alt: row.alt,
      width: row.width ?? null,
      height: row.height ?? null,
      role: mediaRole(row.role),
      sortOrder: row.sort_order,
      paletteId: row.palette_id ?? null,
      palette:
        row.media_type === "image" && !row.url
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
    .sort((a, b) => a.sort_order - b.sort_order)
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
      sortOrder: row.sort_order,
    }));
}

function firstPdpContent(
  value: ProductPdpContentRow | ProductPdpContentRow[] | null,
): ProductPdpContentRow | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function mapProductOfferRow(row: ProductOfferRow): ProductOffer {
  return {
    id: row.id,
    slug: row.slug,
    currency: row.currency === "USD" ? "USD" : "USD",
    status: toStatus(row.status),
    variants: mapOffers(row, row.product_variants),
  };
}

function mapProductCardRow(row: ProductCardRow): ProductCardContent {
  const systemStep = requireSystemStep(row);
  const swatch: [string, string] = [row.swatch_from, row.swatch_to];
  const media = mapMedia(row.product_media, swatch);
  const cardMedia = selectCardMedia(media);
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    productType: row.product_type,
    volume: row.volume,
    usageTime: row.usage_time ?? [],
    routineGroup: toRoutineGroup(row.routine_group),
    systemStepName: systemStep.name,
    systemStepPosition: systemStep.position,
    routineSort: row.routine_sort,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    swatch,
    cardMedia,
    cardHoverMedia:
      presentationMedia(media).find((item) => item.role === "card_hover") ??
      cardMedia,
    cartMedia: selectCartMedia(media, cardMedia),
  };
}

function mapPdpProductRow(row: PdpProductRow): PdpProductContent {
  const systemStep = requireSystemStep(row);
  const swatch: [string, string] = [row.swatch_from, row.swatch_to];
  const media = mapMedia(row.product_media, swatch);
  const cardMedia = selectCardMedia(media);
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    routineGroup: toRoutineGroup(row.routine_group),
    systemStepName: systemStep.name,
    systemStepPosition: systemStep.position,
    routineSort: row.routine_sort,
    productType: row.product_type,
    description: row.editorial_description,
    howToUse: row.editorial_how_to_use,
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

function mapCoreRoutineRow(
  row: CoreRoutineRow,
): CoreRoutineContentSummary {
  const systemStep = requireSystemStep(row);
  const swatch: [string, string] = [row.swatch_from, row.swatch_to];
  const media = mapMedia(row.product_media, swatch);
  const textureRows = media.filter(
    (item) => item.role === "core_routine_texture",
  );
  const editorialRows = media.filter(
    (item) => item.role === "core_routine_editorial",
  );
  const textureMedia = textureRows[0];
  const editorialMedia = editorialRows[0] ?? null;
  if (
    textureRows.length !== 1 ||
    !textureMedia ||
    textureMedia.kind !== "image" ||
    !textureMedia.url ||
    !textureMedia.alt.trim() ||
    !textureMedia.width ||
    !textureMedia.height ||
    editorialRows.length > 1 ||
    (editorialMedia !== null &&
      (editorialMedia.kind !== "image" ||
        !editorialMedia.url ||
        !editorialMedia.alt.trim() ||
        !editorialMedia.width ||
        !editorialMedia.height)) ||
    !isCoreSystemStep(systemStep) ||
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
    displayName: row.display_name,
    productType: row.product_type,
    description: row.editorial_description,
    benefits: row.benefits ?? [],
    goodFor: row.good_for,
    texture: row.texture,
    finish: row.finish,
    keyIngredients: row.key_ingredients ?? [],
    routineGroup: "core",
    systemStepName: systemStep.name,
    systemStepPosition: systemStep.position,
    routineSort: row.routine_sort,
    swatch,
    textureMedia,
    editorialMedia,
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
  return query.order("sort_order", {
    referencedTable: "product_variants",
    ascending: true,
  });
}

export async function getProductCardContents(): Promise<
  ProductCardContent[]
> {
  const supabase = getSupabaseClient();
  const query = supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("catalog_status", "active")
    .in("product_media.role", [...CARD_MEDIA_ROLES])
    .order("sort_order", { ascending: true });
  const { data, error } = await withMediaOrdering(query);

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
  const query = supabase
    .from("products")
    .select(PDP_PRODUCT_SELECT)
    .eq("slug", slug)
    .eq("catalog_status", "active")
    .in("product_media.role", [...PDP_MEDIA_ROLES]);
  const { data, error } = await withMediaOrdering(query).maybeSingle();

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
    .order("sort_order", { ascending: true });
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
    displayName: row.display_name,
    productType: row.product_type,
    editorialDescription: row.editorial_description,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  };
}

export async function getProductRoutes(): Promise<ProductRoute[]> {
  const { data, error } = await getSupabaseClient()
    .from("products")
    .select(PRODUCT_ROUTE_SELECT)
    .eq("catalog_status", "active")
    .order("sort_order", { ascending: true });

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
  const query = supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("catalog_status", "active")
    .neq("slug", excludeSlug)
    .in("product_media.role", [...CARD_MEDIA_ROLES])
    .order("routine_sort", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(limit);
  const { data, error } = await withMediaOrdering(query);

  if (error) {
    throw new Error(
      `[catalog] Failed to load discovery products for "${excludeSlug}": ${error.message}.`,
    );
  }

  return ((data ?? []) as unknown as ProductCardRow[])
    .map(mapProductCardRow)
    .sort(
      (a, b) =>
        a.routineSort - b.routineSort ||
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
        product.systemStepName !== CORE_SYSTEM_STEPS[index].name ||
        product.systemStepPosition !== CORE_SYSTEM_STEPS[index].position,
    )
  ) {
    throw new Error(
      "[catalog] Core routine unavailable: expected active CLEANSE, TREAT, and SEAL sequence with dedicated texture media.",
    );
  }

  return products;
}

export async function getSystemSteps(): Promise<GovernedSystemStep[]> {
  const { data, error } = await getSupabaseClient()
    .from("system_steps")
    .select("name, position, routine_group")
    .order("position", { ascending: true });

  if (error) {
    throw new Error(
      `[catalog] Failed to load the governed System Step registry: ${error.message}.`,
    );
  }

  const steps = (data ?? []).map((row) =>
    systemStepFromDatabaseRelation(row),
  );
  if (steps.some((step) => step === null)) {
    throw new Error("[catalog] The governed System Step registry is invalid.");
  }
  return steps as GovernedSystemStep[];
}

export async function getIngredientIndexProducts(): Promise<
  IngredientIndexProduct[]
> {
  const { data, error } = await getSupabaseClient()
    .from("products")
    .select(INGREDIENT_INDEX_SELECT)
    .eq("catalog_status", "active")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(
      `[catalog] Failed to load ingredient index products: ${error.message}.`,
    );
  }

  return ((data ?? []) as unknown as IngredientIndexRow[]).map((row) => ({
    slug: row.slug,
    displayName: row.display_name,
    keyIngredients: row.key_ingredients ?? [],
    ingredients: row.ingredients,
    formulaNotes: row.formula_notes ?? [],
  }));
}
