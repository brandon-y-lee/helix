import "server-only";

import { resolveProductPresentationMedia } from "@/lib/catalog";
import {
  PRODUCT_EDITOR_DOCUMENT_SCHEMA_VERSION,
  type ProductEditorDocumentV1,
  type ProductEditorMediaV1,
  type ProductEditorProductV1,
  type ProductEditorVariantV1,
} from "@/lib/catalog-editor/contracts";
import type {
  CatalogPreviewBase,
} from "@/lib/catalog-editor/preview-data";
import {
  normalizeProductPdpContent,
  type ProductPdpContent,
  type ProductPdpContentRow,
} from "@/lib/catalog/product-content";
import type {
  CoreRoutineSummary,
  OfferAvailability,
  PdpProduct,
} from "@/lib/catalog/models";
import type {
  PlaceholderPalette,
  ProductMedia,
  ProductMediaRole,
  ProductStatus,
} from "@/lib/products";

const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_STATUSES: ProductStatus[] = [
  "available",
  "coming_soon",
  "sold_out",
];
const INVENTORY_STATUSES = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "unavailable",
] as const;
const MEDIA_ROLES: ProductMediaRole[] = [
  "card",
  "hero",
  "gallery",
  "detail",
  "campaign",
  "card_default",
  "card_hover",
  "cart",
  "search",
  "routine_video",
  "routine_video_poster",
  "profile_editorial",
  "ingredients_texture",
  "core_routine_texture",
  "pdp_outcome",
  "pdp_application",
];
const IMAGE_EXTENSIONS = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const VIDEO_EXTENSIONS = /\.(?:mov|mp4|webm)$/i;

export class CatalogPreviewProjectionError extends Error {
  constructor(
    public readonly code:
      | "unsupported_schema"
      | "validation_error"
      | "product_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "CatalogPreviewProjectionError";
  }
}

export type CatalogPreviewProjection = {
  product: PdpProduct;
  coreProducts: CoreRoutineSummary[];
  warnings: string[];
};

type ProjectionOptions = {
  approvedMediaOrigin?: string;
};

function invalid(message: string): never {
  throw new CatalogPreviewProjectionError("validation_error", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown, field: string, allowNull = false) {
  if (allowNull && (value === null || value === undefined)) return null;
  if (typeof value !== "string") invalid(`${field} must be text.`);
  return value;
}

function optionalText(
  product: ProductEditorProductV1,
  field: keyof ProductEditorProductV1,
  fallback: string | null,
) {
  if (product[field] === undefined) return fallback;
  return stringValue(product[field], `product.${String(field)}`, true);
}

function optionalStringArray(
  product: ProductEditorProductV1,
  field: keyof ProductEditorProductV1,
  fallback: string[],
) {
  const value = product[field];
  if (value === undefined) return fallback;
  if (
    value === null ||
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string")
  ) {
    invalid(`product.${String(field)} must be a list of text values.`);
  }
  return [...value];
}

function validHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function optionalSwatch(
  product: ProductEditorProductV1,
  fallback: [string, string],
): [string, string] {
  if (product.swatch === undefined || product.swatch === null) return fallback;
  if (
    !Array.isArray(product.swatch) ||
    product.swatch.length !== 2 ||
    !validHex(product.swatch[0]) ||
    !validHex(product.swatch[1])
  ) {
    invalid("product.swatch must contain two six-digit hex colors.");
  }
  return [product.swatch[0], product.swatch[1]];
}

function optionalProductDetails(
  product: ProductEditorProductV1,
  fallback: Record<string, string>,
) {
  if (product.productDetails === undefined) return fallback;
  if (
    product.productDetails === null ||
    !isRecord(product.productDetails) ||
    Object.values(product.productDetails).some(
      (value) => typeof value !== "string",
    )
  ) {
    invalid("product.productDetails must contain text values.");
  }
  return { ...product.productDetails } as Record<string, string>;
}

function toPdpContent(
  value: ProductPdpContent | null,
  slug: string,
): ProductPdpContent | null {
  if (value === null) return null;
  if (!isRecord(value)) invalid("productPdpContent must be an object or null.");

  try {
    return normalizeProductPdpContent(
      {
        schema_version: value.schemaVersion,
        profile_title_tokens: value.profileTitleTokens,
        routine_overlay: value.routineOverlay,
        outcome_heading: value.outcomeHeading,
        outcome_labels: value.outcomeLabels,
        how_to_use_steps: value.howToUseSteps,
        application_steps: value.applicationSteps,
        ingredient_cards: value.ingredientCards,
        ingredient_story: value.ingredientStory,
        routine_guidance: value.routineGuidance,
      } as ProductPdpContentRow,
      slug,
    );
  } catch (error) {
    invalid(
      error instanceof Error
        ? error.message
        : "productPdpContent has an unsupported shape.",
    );
  }
}

function safePalette(
  palette: PlaceholderPalette | null | undefined,
  fallback: [string, string],
): PlaceholderPalette {
  if (!palette) return { start: fallback[0], end: fallback[1] };
  return {
    start: validHex(palette.start) ? palette.start : fallback[0],
    end: validHex(palette.end) ? palette.end : fallback[1],
    accent: validHex(palette.accent) ? palette.accent : undefined,
    surface: validHex(palette.surface) ? palette.surface : undefined,
    ink: validHex(palette.ink) ? palette.ink : undefined,
    highlight: validHex(palette.highlight) ? palette.highlight : undefined,
  };
}

function approvedStorageUrl(
  value: string,
  kind: "image" | "video",
  configuredOrigin: string | undefined,
) {
  if (!configuredOrigin) return false;
  try {
    const url = new URL(value);
    const approvedOrigin = new URL(configuredOrigin).origin;
    if (
      url.origin !== approvedOrigin ||
      !url.pathname.startsWith(
        "/storage/v1/object/public/mei-pelle-catalog/",
      )
    ) {
      return false;
    }
    return kind === "image"
      ? IMAGE_EXTENSIONS.test(url.pathname)
      : VIDEO_EXTENSIONS.test(url.pathname);
  } catch {
    return false;
  }
}

function safeMedia(
  items: ProductEditorMediaV1[],
  swatch: [string, string],
  approvedMediaOrigin: string | undefined,
) {
  const media: ProductMedia[] = [];
  let rejected = 0;

  items
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .forEach((item) => {
      if (
        !item ||
        !["image", "video", "placeholder"].includes(item.kind) ||
        !MEDIA_ROLES.includes(item.role) ||
        !Number.isSafeInteger(item.sortOrder) ||
        typeof item.alt !== "string"
      ) {
        rejected += 1;
        return;
      }

      if (item.kind === "placeholder") {
        media.push({
          kind: "placeholder",
          url: null,
          alt: item.alt,
          width: null,
          height: null,
          role: item.role,
          sortOrder: item.sortOrder,
          paletteId:
            typeof item.paletteId === "string" ? item.paletteId : null,
          palette: safePalette(item.palette, swatch),
        });
        return;
      }

      if (
        typeof item.url !== "string" ||
        !approvedStorageUrl(item.url, item.kind, approvedMediaOrigin) ||
        (item.kind === "video" && item.role !== "routine_video") ||
        (item.kind === "image" && item.role === "routine_video")
      ) {
        rejected += 1;
        return;
      }

      media.push({
        kind: item.kind,
        url: item.url,
        alt: item.alt,
        width:
          Number.isSafeInteger(item.width) && Number(item.width) > 0
            ? Number(item.width)
            : null,
        height:
          Number.isSafeInteger(item.height) && Number(item.height) > 0
            ? Number(item.height)
            : null,
        role: item.role,
        sortOrder: item.sortOrder,
        paletteId: null,
        palette: null,
      });
    });

  return { media, rejected };
}

function safeVariants(
  items: ProductEditorVariantV1[],
  product: Pick<PdpProduct, "id" | "slug" | "status">,
): OfferAvailability[] {
  if (!Array.isArray(items)) invalid("variants must be a list.");
  const ids = new Set<string>();

  return items
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => {
      if (
        !item ||
        typeof item.id !== "string" ||
        !item.id.trim() ||
        ids.has(item.id) ||
        typeof item.label !== "string" ||
        !item.label.trim() ||
        !Number.isSafeInteger(item.price) ||
        item.price < 0 ||
        typeof item.available !== "boolean" ||
        !INVENTORY_STATUSES.includes(item.inventoryStatus) ||
        !Number.isSafeInteger(item.sortOrder)
      ) {
        invalid(`variants[${index}] has an unsupported shape.`);
      }
      if (
        item.packCount !== undefined &&
        item.packCount !== null &&
        (!Number.isSafeInteger(item.packCount) || item.packCount < 1)
      ) {
        invalid(`variants[${index}].packCount must be a positive integer.`);
      }
      ids.add(item.id);
      return {
        productId: product.id,
        productSlug: product.slug,
        productStatus: product.status,
        id: item.id,
        label: item.label,
        price: item.price,
        available: item.available,
        inventoryStatus: item.inventoryStatus,
        volume:
          item.volume === undefined || item.volume === null
            ? null
            : stringValue(item.volume, `variants[${index}].volume`),
        packCount: item.packCount ?? null,
        sortOrder: item.sortOrder,
      };
    });
}

function validateDocument(value: unknown): ProductEditorDocumentV1 {
  if (!isRecord(value)) invalid("The saved draft document is not an object.");
  if (value.schemaVersion !== PRODUCT_EDITOR_DOCUMENT_SCHEMA_VERSION) {
    throw new CatalogPreviewProjectionError(
      "unsupported_schema",
      `Draft schema version ${String(value.schemaVersion)} is not supported.`,
    );
  }
  if (
    typeof value.productId !== "string" ||
    !UUID_PATTERN.test(value.productId) ||
    !isRecord(value.product) ||
    !Array.isArray(value.variants) ||
    !Array.isArray(value.media) ||
    !Array.isArray(value.relationships) ||
    !("productPdpContent" in value)
  ) {
    invalid("The saved draft document is incomplete.");
  }
  return value as unknown as ProductEditorDocumentV1;
}

function projectCoreProducts(
  baseProducts: CoreRoutineSummary[],
  product: PdpProduct,
  draftProduct: ProductEditorProductV1,
) {
  return baseProducts.map((item) => {
    if (item.id !== product.id) return item;

    const textureMedia =
      product.media.find(
        (media) =>
          media.role === "core_routine_texture" &&
          media.kind === "image" &&
          Boolean(media.url),
      ) ?? item.textureMedia;

    return {
      ...item,
      slug: product.slug,
      displayName: product.displayName,
      formalTitle:
        optionalText(draftProduct, "formalTitle", item.formalTitle) ??
        item.formalTitle,
      productType: product.productType ?? item.productType,
      cardTagline: product.cardTagline,
      description: product.description,
      benefits: optionalStringArray(
        draftProduct,
        "benefits",
        item.benefits,
      ),
      goodFor: product.goodFor,
      texture: product.texture,
      finish: product.finish,
      keyIngredients: product.keyIngredients,
      routineStepNumber:
        product.routineStepNumber ?? item.routineStepNumber,
      routineStepName: product.routineStepName ?? item.routineStepName,
      swatch: product.swatch,
      textureMedia,
      cardMedia: product.cardMedia,
      cartMedia: product.cartMedia,
      pdpContent: product.pdpContent,
      status: product.status,
      variants: product.variants,
    };
  });
}

export function projectCatalogDraftPreview(
  rawDocument: unknown,
  base: CatalogPreviewBase,
  options: ProjectionOptions = {},
): CatalogPreviewProjection {
  const document = validateDocument(rawDocument);
  if (document.productId !== base.product.id) {
    throw new CatalogPreviewProjectionError(
      "product_unavailable",
      "The saved draft no longer matches its canonical product.",
    );
  }

  const draft = document.product;
  if (
    typeof draft.slug !== "string" ||
    !PRODUCT_SLUG_PATTERN.test(draft.slug)
  ) {
    invalid("product.slug is invalid.");
  }

  const status =
    draft.status === undefined || draft.status === null
      ? base.product.status
      : PRODUCT_STATUSES.includes(draft.status)
        ? draft.status
        : invalid("product.status is invalid.");
  const displayName =
    optionalText(
      draft,
      "displayName",
      optionalText(draft, "name", base.product.displayName),
    ) ?? "";
  if (!displayName.trim()) invalid("product.displayName cannot be empty.");
  const cardTagline =
    optionalText(
      draft,
      "cardTagline",
      optionalText(draft, "tagline", base.product.cardTagline),
    ) ?? "";
  const description =
    optionalText(
      draft,
      "editorialDescription",
      optionalText(draft, "description", base.product.description),
    ) ?? "";
  const howToUse =
    optionalText(
      draft,
      "editorialHowToUse",
      optionalText(draft, "howToUse", base.product.howToUse),
    ) ?? "";
  const swatch = optionalSwatch(draft, base.product.swatch);
  const { media, rejected } = safeMedia(
    document.media,
    swatch,
    options.approvedMediaOrigin ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const presentationMedia = resolveProductPresentationMedia(media);

  const productWithoutVariants: PdpProduct = {
    ...base.product,
    slug: draft.slug,
    displayName,
    cardTagline,
    collection:
      optionalText(draft, "collection", base.product.collection) ??
      base.product.collection,
    routineNumber: optionalText(
      draft,
      "routineNumber",
      base.product.routineNumber,
    ),
    routineGroup:
      draft.routineGroup === undefined
        ? base.product.routineGroup
        : draft.routineGroup,
    routineGroupLabel: optionalText(
      draft,
      "routineGroupLabel",
      base.product.routineGroupLabel,
    ),
    routineStepNumber:
      draft.routineStepNumber === undefined
        ? base.product.routineStepNumber
        : draft.routineStepNumber,
    routineStepName: optionalText(
      draft,
      "routineStepName",
      base.product.routineStepName,
    ),
    routineDisplayLabel: optionalText(
      draft,
      "routineDisplayLabel",
      base.product.routineDisplayLabel,
    ),
    productType: optionalText(
      draft,
      "productType",
      base.product.productType,
    ),
    description,
    howToUse,
    swatch,
    media,
    cardMedia: presentationMedia.cardMedia,
    detailMedia: presentationMedia.detailMedia,
    cartMedia: presentationMedia.cartMedia,
    madeFor: optionalText(draft, "madeFor", base.product.madeFor),
    goodFor: optionalText(draft, "goodFor", base.product.goodFor),
    texture: optionalText(draft, "texture", base.product.texture),
    keyIngredients: optionalStringArray(
      draft,
      "keyIngredients",
      base.product.keyIngredients,
    ),
    ingredients: optionalText(
      draft,
      "ingredients",
      base.product.ingredients,
    ),
    productDetails: optionalProductDetails(
      draft,
      base.product.productDetails,
    ),
    cautions: optionalStringArray(
      draft,
      "cautions",
      base.product.cautions,
    ),
    finish: optionalText(draft, "finish", base.product.finish),
    volume: optionalText(draft, "volume", base.product.volume),
    skinTypes: optionalStringArray(
      draft,
      "skinTypes",
      base.product.skinTypes,
    ),
    usageTime: optionalStringArray(
      draft,
      "usageTime",
      base.product.usageTime,
    ),
    pdpContent: toPdpContent(document.productPdpContent, draft.slug),
    status,
    variants: [],
  };
  const product = {
    ...productWithoutVariants,
    variants: safeVariants(document.variants, productWithoutVariants),
  };
  const warnings = [
    ...(rejected > 0
      ? [
          `${rejected} draft media ${rejected === 1 ? "item was" : "items were"} omitted because the source, role, or type was not approved.`,
        ]
      : []),
    ...(media.length === 0
      ? ["Draft media is unavailable; layout placeholders are shown."]
      : []),
  ];

  return {
    product,
    coreProducts: projectCoreProducts(
      base.coreProducts,
      product,
      draft,
    ),
    warnings,
  };
}
