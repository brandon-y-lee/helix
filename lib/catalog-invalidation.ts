import {
  mediaEventOnlyAffectsPdp,
  type CatalogWebhookPayload,
  type SyncOutcome,
} from "@/lib/algolia/sync";
import {
  CATALOG_PRODUCTS_CACHE_TAG,
  collectionCacheTag,
  CORE_ROUTINE_CACHE_TAG,
  CORE_ROUTINE_PRODUCT_SLUGS,
  DISCOVERY_CACHE_TAG,
  productCardCacheTag,
  productContentCacheTag,
  productOfferCacheTag,
  PRODUCT_CARD_COLLECTION_CACHE_TAG,
  PRODUCT_CONTENT_COLLECTION_CACHE_TAG,
  PRODUCT_OFFER_COLLECTION_CACHE_TAG,
} from "@/lib/catalog-cache";

export type CatalogInvalidationTargets = {
  tags: string[];
  paths: string[];
};

const PRODUCT_OFFER_FIELDS = new Set([
  "status",
  "catalog_status",
  "currency",
]);
const PRODUCT_CARD_ONLY_FIELDS = new Set([
  "card_tagline",
  "badge",
  "sort_order",
]);
const PRODUCT_CARD_SHARED_FIELDS = new Set([
  "slug",
  "display_name",
  "formal_title",
  "product_type",
  "swatch_from",
  "swatch_to",
]);
const PRODUCT_MEMBERSHIP_FIELDS = new Set([
  "catalog_status",
  "routine_group",
  "slug",
]);
const PRODUCT_DISCOVERY_FIELDS = new Set([
  "catalog_status",
  "routine_group",
  "routine_sort",
  "sort_order",
  "slug",
]);
const PRODUCT_COLLECTION_FIELDS = new Set([
  "catalog_status",
  "routine_group",
  "sort_order",
  "slug",
]);
const PRODUCT_IGNORED_FIELDS = new Set(["updated_at"]);
const CARD_MEDIA_ROLES = new Set([
  "card",
  "card_default",
  "card_hover",
  "search",
]);

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function valuesMatch(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object"
  ) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function changedProductFields(payload: CatalogWebhookPayload): Set<string> {
  if (payload.type !== "UPDATE") return new Set();
  const record = payload.record ?? {};
  const oldRecord = payload.old_record ?? {};
  const keys = new Set([...Object.keys(record), ...Object.keys(oldRecord)]);
  return new Set(
    [...keys].filter(
      (key) =>
        !PRODUCT_IGNORED_FIELDS.has(key) &&
        !valuesMatch(record[key], oldRecord[key]),
    ),
  );
}

function includesAny(
  values: ReadonlySet<string>,
  candidates: ReadonlySet<string>,
): boolean {
  return [...values].some((value) => candidates.has(value));
}

function isCoreRoutineTextureEvent(payload: CatalogWebhookPayload): boolean {
  if (payload.table !== "product_media") return false;
  return [payload.record?.role, payload.old_record?.role].some(
    (role) => role === "core_routine_texture",
  );
}

function mediaAffectsCard(payload: CatalogWebhookPayload): boolean {
  if (payload.table !== "product_media") return false;
  return [payload.record?.role, payload.old_record?.role].some(
    (role) => typeof role === "string" && CARD_MEDIA_ROLES.has(role),
  );
}

function mediaAffectsContent(payload: CatalogWebhookPayload): boolean {
  if (payload.table !== "product_media") return false;
  const roles = [payload.record?.role, payload.old_record?.role].filter(
    (role): role is string => typeof role === "string",
  );
  return roles.length === 0 || roles.some((role) => !CARD_MEDIA_ROLES.has(role));
}

export function getCatalogInvalidationTargets(
  payload: CatalogWebhookPayload,
  outcome?: SyncOutcome,
): CatalogInvalidationTargets {
  const tags = new Set<string>();
  const paths = new Set<string>();
  const source = payload.record ?? payload.old_record;
  const slug = outcome?.slug ?? asText(source?.slug);
  const oldSlug = outcome?.oldSlug ?? asText(payload.old_record?.slug);
  const routineGroup =
    outcome?.routineGroup ?? asText(source?.routine_group);
  const oldRoutineGroup =
    outcome?.oldRoutineGroup ?? asText(payload.old_record?.routine_group);
  const productKeys = [slug, oldSlug].filter(
    (value, index, values): value is string =>
      Boolean(value) && values.indexOf(value) === index,
  );

  let invalidateContent = false;
  let invalidateOffer = false;
  let invalidateCard = false;
  let invalidateMembership = false;
  let invalidateDiscovery = false;
  let invalidateCollection = false;

  if (payload.table === "product_variants") {
    invalidateOffer = true;
  } else if (payload.table === "product_media") {
    invalidateCard = mediaAffectsCard(payload);
    invalidateContent = mediaAffectsContent(payload);
  } else if (payload.table === "product_pdp_content") {
    invalidateContent = true;
  } else if (payload.table === "products") {
    const changedFields = changedProductFields(payload);
    const broadProductChange =
      payload.type !== "UPDATE" || changedFields.size === 0;

    invalidateOffer =
      broadProductChange ||
      includesAny(changedFields, PRODUCT_OFFER_FIELDS);
    invalidateCard =
      broadProductChange ||
      includesAny(changedFields, PRODUCT_CARD_ONLY_FIELDS) ||
      includesAny(changedFields, PRODUCT_CARD_SHARED_FIELDS);
    invalidateMembership =
      broadProductChange ||
      includesAny(changedFields, PRODUCT_MEMBERSHIP_FIELDS);
    invalidateDiscovery =
      broadProductChange ||
      includesAny(changedFields, PRODUCT_DISCOVERY_FIELDS);
    invalidateCollection =
      broadProductChange ||
      includesAny(changedFields, PRODUCT_COLLECTION_FIELDS);
    invalidateContent =
      broadProductChange ||
      [...changedFields].some(
        (field) =>
          !PRODUCT_OFFER_FIELDS.has(field) &&
          !PRODUCT_CARD_ONLY_FIELDS.has(field),
      );
  }

  for (const productKey of productKeys) {
    if (invalidateContent) tags.add(productContentCacheTag(productKey));
    if (invalidateOffer) tags.add(productOfferCacheTag(productKey));
    if (invalidateCard) tags.add(productCardCacheTag(productKey));
    paths.add(`/products/${productKey}`);
  }

  if (invalidateContent) {
    tags.add(PRODUCT_CONTENT_COLLECTION_CACHE_TAG);
    paths.add("/");
    paths.add("/system");
  }
  if (invalidateOffer) {
    tags.add(PRODUCT_OFFER_COLLECTION_CACHE_TAG);
    paths.add("/");
    paths.add("/products");
    paths.add("/system");
  }
  if (invalidateCard) {
    tags.add(PRODUCT_CARD_COLLECTION_CACHE_TAG);
    paths.add("/");
    paths.add("/products");
  }
  if (invalidateMembership) {
    tags.add(CATALOG_PRODUCTS_CACHE_TAG);
    paths.add("/");
    paths.add("/products");
    paths.add("/sitemap.xml");
  }
  if (invalidateDiscovery) tags.add(DISCOVERY_CACHE_TAG);

  if (invalidateCollection && routineGroup) {
    tags.add(collectionCacheTag(routineGroup));
  }
  if (
    invalidateCollection &&
    oldRoutineGroup &&
    oldRoutineGroup !== routineGroup
  ) {
    tags.add(collectionCacheTag(oldRoutineGroup));
  }

  const affectsCoreRoutine =
    isCoreRoutineTextureEvent(payload) ||
    (payload.table === "product_pdp_content" &&
      (routineGroup === "core" || oldRoutineGroup === "core")) ||
    (payload.table === "products" &&
      invalidateContent &&
      (routineGroup === "core" || oldRoutineGroup === "core"));
  if (affectsCoreRoutine) {
    tags.add(CORE_ROUTINE_CACHE_TAG);
    for (const coreSlug of CORE_ROUTINE_PRODUCT_SLUGS) {
      paths.add(`/products/${coreSlug}`);
    }
  }

  if (mediaEventOnlyAffectsPdp(payload) && !isCoreRoutineTextureEvent(payload)) {
    paths.delete("/");
    paths.delete("/system");
  }

  return { tags: [...tags], paths: [...paths] };
}
