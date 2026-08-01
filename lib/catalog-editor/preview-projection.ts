import "server-only";

import { resolveProductPresentationMedia } from "@/lib/catalog";
import { assertValidProductEditorDocument } from "@/lib/admin/catalog/validation";
import {
  PRODUCT_EDITOR_SCHEMA_VERSION,
  type CatalogProductFields,
  type CatalogProductMedia,
  type CatalogProductPdpContentFields,
  type CatalogProductVariant,
  type ProductEditorDocumentV3,
} from "@/lib/admin/catalog/types";
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
import { PRODUCT_MEDIA_ROLES } from "@/lib/catalog/media-roles";

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
const MEDIA_ROLES: readonly ProductMediaRole[] = PRODUCT_MEDIA_ROLES;
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
  product: CatalogProductFields,
  field: keyof CatalogProductFields,
  fallback: string | null,
) {
  if (product[field] === undefined) return fallback;
  return stringValue(product[field], `product.${String(field)}`, true);
}

function optionalStringArray(
  product: CatalogProductFields,
  field: keyof CatalogProductFields,
  fallback: string[],
): string[] {
  const value: unknown = product[field];
  if (value === undefined) return fallback;
  if (
    value === null ||
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string")
  ) {
    invalid(`product.${String(field)} must be a list of text values.`);
  }
  return value as string[];
}

function validHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function optionalSwatch(
  product: CatalogProductFields,
  fallback: [string, string],
): [string, string] {
  if (!validHex(product.swatch_from) || !validHex(product.swatch_to)) {
    return fallback;
  }
  return [product.swatch_from, product.swatch_to];
}

function toPdpContent(
  value: CatalogProductPdpContentFields | null,
  slug: string,
): ProductPdpContent | null {
  if (value === null) return null;
  if (!isRecord(value)) invalid("productPdpContent must be an object or null.");

  try {
    return normalizeProductPdpContent(
      {
        schema_version: value.schema_version,
        profile_title_tokens: value.profile_title_tokens,
        routine_overlay: value.routine_overlay,
        outcome_heading: value.outcome_heading,
        outcome_labels: value.outcome_labels,
        how_to_use_steps: value.how_to_use_steps,
        application_steps: value.application_steps,
        ingredient_cards: value.ingredient_cards,
        ingredient_story: value.ingredient_story,
        routine_guidance: value.routine_guidance,
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
  items: CatalogProductMedia[],
  swatch: [string, string],
  approvedMediaOrigin: string | undefined,
) {
  const media: ProductMedia[] = [];
  let rejected = 0;

  items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach((item) => {
      const kind =
        item.media_type === "video"
          ? "video"
          : item.url
            ? "image"
            : "placeholder";
      if (
        !item ||
        !["image", "video", "placeholder"].includes(kind) ||
        !MEDIA_ROLES.includes(item.role as ProductMediaRole) ||
        !Number.isSafeInteger(item.sort_order) ||
        typeof item.alt !== "string"
      ) {
        rejected += 1;
        return;
      }

      if (kind === "placeholder") {
        media.push({
          kind: "placeholder",
          url: null,
          alt: item.alt,
          width: null,
          height: null,
          role: item.role as ProductMediaRole,
          sortOrder: item.sort_order,
          paletteId:
            typeof item.palette_id === "string" ? item.palette_id : null,
          palette: safePalette(
            isRecord(item.placeholder_palette)
              ? (item.placeholder_palette as PlaceholderPalette)
              : null,
            swatch,
          ),
        });
        return;
      }

      if (
        typeof item.url !== "string" ||
        !approvedStorageUrl(item.url, kind, approvedMediaOrigin) ||
        (kind === "video" && item.role !== "routine_video") ||
        (kind === "image" && item.role === "routine_video")
      ) {
        rejected += 1;
        return;
      }

      media.push({
        kind,
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
        role: item.role as ProductMediaRole,
        sortOrder: item.sort_order,
        paletteId: null,
        palette: null,
      });
    });

  return { media, rejected };
}

function safeVariants(
  items: CatalogProductVariant[],
  product: Pick<PdpProduct, "id" | "slug" | "status">,
): OfferAvailability[] {
  if (!Array.isArray(items)) invalid("variants must be a list.");
  const ids = new Set<string>();

  return items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item, index) => {
      if (
        !item ||
        typeof item.id !== "string" ||
        !item.id.trim() ||
        ids.has(item.id) ||
        typeof item.label !== "string" ||
        !item.label.trim() ||
        !Number.isSafeInteger(item.price_cents) ||
        item.price_cents < 0 ||
        typeof item.available !== "boolean" ||
        !INVENTORY_STATUSES.includes(
          item.inventory_status as (typeof INVENTORY_STATUSES)[number],
        ) ||
        !Number.isSafeInteger(item.sort_order)
      ) {
        invalid(`variants[${index}] has an unsupported shape.`);
      }
      if (
        item.pack_count !== undefined &&
        item.pack_count !== null &&
        (!Number.isSafeInteger(item.pack_count) || item.pack_count < 1)
      ) {
        invalid(`variants[${index}].pack_count must be a positive integer.`);
      }
      ids.add(item.id);
      return {
        productId: product.id,
        productSlug: product.slug,
        productStatus: product.status,
        id: item.id,
        label: item.label,
        price: item.price_cents,
        available: item.available,
        inventoryStatus:
          item.inventory_status as OfferAvailability["inventoryStatus"],
        volume:
          item.volume === undefined || item.volume === null
            ? null
            : stringValue(item.volume, `variants[${index}].volume`),
        packCount: item.pack_count ?? null,
        sortOrder: item.sort_order,
      };
    });
}

function validateDocument(
  value: unknown,
  approvedMediaOrigin?: string,
): ProductEditorDocumentV3 {
  if (!isRecord(value)) invalid("The saved draft document is not an object.");
  if (value.schemaVersion !== PRODUCT_EDITOR_SCHEMA_VERSION) {
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
  try {
    return assertValidProductEditorDocument(value, {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL:
        approvedMediaOrigin ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
  } catch (error) {
    invalid(
      error instanceof Error
        ? error.message
        : "The saved draft document failed validation.",
    );
  }
}

function projectCoreProducts(
  baseProducts: CoreRoutineSummary[],
  product: PdpProduct,
  draftProduct: CatalogProductFields,
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
    const editorialMedia =
      product.media.find(
        (media) =>
          media.role === "core_routine_editorial" &&
          media.kind === "image" &&
          Boolean(media.url),
      ) ?? null;

    return {
      ...item,
      slug: product.slug,
      displayName: product.displayName,
      formalTitle:
        optionalText(draftProduct, "formal_title", item.formalTitle) ??
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
      editorialMedia,
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
  const document = validateDocument(
    rawDocument,
    options.approvedMediaOrigin,
  );
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
    draft.status === null
      ? base.product.status
      : PRODUCT_STATUSES.includes(draft.status as ProductStatus)
        ? (draft.status as ProductStatus)
        : invalid("product.status is invalid.");
  const displayName = draft.display_name;
  if (!displayName.trim()) invalid("product.displayName cannot be empty.");
  const cardTagline = draft.card_tagline;
  const description = draft.editorial_description;
  const howToUse = draft.editorial_how_to_use;
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
    routineGroup:
      draft.routine_group === "core" || draft.routine_group === "beyond_core"
        ? draft.routine_group
        : invalid("product.routine_group is invalid."),
    routineStepNumber: draft.routine_step_number,
    routineStepName: optionalText(
      draft,
      "routine_step_name",
      base.product.routineStepName,
    ),
    routineSort: draft.routine_sort,
    productType: draft.product_type,
    description,
    howToUse,
    swatch,
    media,
    cardMedia: presentationMedia.cardMedia,
    detailMedia: presentationMedia.detailMedia,
    cartMedia: presentationMedia.cartMedia,
    madeFor: optionalText(draft, "made_for", base.product.madeFor),
    goodFor: optionalText(draft, "good_for", base.product.goodFor),
    texture: optionalText(draft, "texture", base.product.texture),
    keyIngredients: optionalStringArray(
      draft,
      "key_ingredients",
      base.product.keyIngredients,
    ),
    ingredients: optionalText(
      draft,
      "ingredients",
      base.product.ingredients,
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
      "skin_types",
      base.product.skinTypes,
    ),
    usageTime: optionalStringArray(
      draft,
      "usage_time",
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
