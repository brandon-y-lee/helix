import {
  PRODUCT_EDITOR_SCHEMA_VERSION,
  type ProductEditorDocumentV1,
  type ProductEditorDocumentV2,
  type StoredProductEditorDocument,
} from "@/lib/admin/catalog/types";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function preferred(
  object: JsonObject,
  canonical: string,
  legacy: string,
): unknown {
  const canonicalValue = object[canonical];
  if (
    canonicalValue !== null &&
    canonicalValue !== undefined &&
    (typeof canonicalValue !== "string" || canonicalValue.trim())
  ) {
    return canonicalValue;
  }
  return object[legacy];
}

function normalizedText(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/g, " ").trim()
    : null;
}

function upgradeV1(document: ProductEditorDocumentV1): ProductEditorDocumentV2 {
  const product = document.product;
  if (
    !isObject(product) ||
    !Array.isArray(document.variants) ||
    !Array.isArray(document.media) ||
    !Array.isArray(document.relationships)
  ) {
    throw new CatalogAdminError(
      "unsupported_schema",
      "The V1 catalog document cannot be upgraded because it is incomplete.",
      422,
    );
  }

  const ingredients = normalizedText(product.ingredients);
  const compatibilityInci = isObject(product.product_details)
    ? normalizedText(product.product_details.sourceFullInci)
    : null;
  if (
    ingredients &&
    compatibilityInci &&
    ingredients !== compatibilityInci
  ) {
    throw new CatalogAdminError(
      "ambiguous_revision",
      "The V1 catalog document contains conflicting full INCI values.",
      422,
    );
  }

  const variants = document.variants.map((variant, index) => {
    if (!isObject(variant)) {
      throw new CatalogAdminError(
        "unsupported_schema",
        `The V1 variant at index ${index} is invalid.`,
        422,
      );
    }
    const { position, ...canonical } = variant;
    const sortOrder = variant.sort_order ?? position;
    if (!Number.isSafeInteger(sortOrder)) {
      throw new CatalogAdminError(
        "ambiguous_revision",
        `The V1 variant at index ${index} has no canonical order.`,
        422,
      );
    }
    return { ...canonical, sort_order: sortOrder };
  });

  const media = document.media.map((item, index) => {
    if (!isObject(item)) {
      throw new CatalogAdminError(
        "unsupported_schema",
        `The V1 media item at index ${index} is invalid.`,
        422,
      );
    }
    if (item.role === "campaign") {
      throw new CatalogAdminError(
        "ambiguous_revision",
        "The legacy campaign media role must be reassigned before restore.",
        422,
      );
    }
    const { media_kind: mediaKind, ...canonical } = item;
    return {
      ...canonical,
      media_type:
        normalizedText(item.media_type) ??
        (mediaKind === "video" ? "video" : "image"),
    };
  });

  return {
    schemaVersion: PRODUCT_EDITOR_SCHEMA_VERSION,
    productId: document.productId,
    product: {
      slug: product.slug,
      display_name: preferred(product, "display_name", "name"),
      formal_title: preferred(product, "formal_title", "name"),
      card_tagline: preferred(product, "card_tagline", "tagline"),
      product_type: product.product_type,
      catalog_status: product.catalog_status,
      badge: product.badge,
      currency: product.currency,
      sort_order: preferred(product, "sort_order", "position"),
      editorial_description: preferred(
        product,
        "editorial_description",
        "description",
      ),
      benefits: product.benefits,
      editorial_how_to_use: preferred(
        product,
        "editorial_how_to_use",
        "how_to_use",
      ),
      formula_notes: product.formula_notes,
      swatch_from: product.swatch_from,
      swatch_to: product.swatch_to,
      status: product.status,
      made_for: product.made_for,
      good_for: product.good_for,
      texture: product.texture,
      key_ingredients: product.key_ingredients,
      ingredients: ingredients ?? compatibilityInci,
      cautions: product.cautions,
      finish: product.finish,
      volume: product.volume,
      skin_types: product.skin_types,
      concerns: product.concerns,
      usage_time: product.usage_time,
      seo_title: product.seo_title,
      seo_description: product.seo_description,
      search_keywords: product.search_keywords,
      routine_group: product.routine_group,
      routine_step_number: product.routine_step_number,
      routine_step_name: product.routine_step_name,
      routine_sort: product.routine_sort,
    } as ProductEditorDocumentV2["product"],
    productPdpContent:
      document.productPdpContent as ProductEditorDocumentV2["productPdpContent"],
    variants: variants as ProductEditorDocumentV2["variants"],
    media: media as ProductEditorDocumentV2["media"],
    relationships:
      document.relationships as ProductEditorDocumentV2["relationships"],
  };
}

export function upgradeProductEditorDocument(
  input: StoredProductEditorDocument,
): ProductEditorDocumentV2 {
  if (input.schemaVersion === PRODUCT_EDITOR_SCHEMA_VERSION) return input;
  if (input.schemaVersion === 1) return upgradeV1(input);
  throw new CatalogAdminError(
    "unsupported_schema",
    "The catalog document schema version is not supported.",
    422,
  );
}
