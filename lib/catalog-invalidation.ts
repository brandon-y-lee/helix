import {
  mediaEventOnlyAffectsPdp,
  type CatalogWebhookPayload,
  type SyncOutcome,
} from "@/lib/algolia/sync";
import {
  collectionCacheTag,
  CORE_ROUTINE_CACHE_TAG,
  CORE_ROUTINE_PRODUCT_SLUGS,
} from "@/lib/catalog-cache";

export type CatalogInvalidationTargets = {
  tags: string[];
  paths: string[];
};

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isCoreRoutineTextureEvent(payload: CatalogWebhookPayload): boolean {
  if (payload.table !== "product_media") return false;
  return [payload.record?.role, payload.old_record?.role].some(
    (role) => role === "core_routine_texture",
  );
}

export function getCatalogInvalidationTargets(
  payload: CatalogWebhookPayload,
  outcome?: SyncOutcome,
): CatalogInvalidationTargets {
  const pdpOnlyMedia = mediaEventOnlyAffectsPdp(payload);
  const tags = new Set<string>(
    pdpOnlyMedia ? [] : ["catalog", "products", "collections"],
  );
  const paths = new Set<string>(pdpOnlyMedia ? [] : ["/", "/products"]);
  const source = payload.record ?? payload.old_record;
  const slug = outcome?.slug ?? asText(source?.slug);
  const oldSlug = outcome?.oldSlug ?? asText(payload.old_record?.slug);
  const collection = outcome?.collection ?? asText(source?.collection);
  const oldCollection =
    outcome?.oldCollection ?? asText(payload.old_record?.collection);
  const routineGroup =
    outcome?.routineGroup ?? asText(source?.routine_group);
  const oldRoutineGroup =
    outcome?.oldRoutineGroup ?? asText(payload.old_record?.routine_group);
  const affectsCoreRoutine =
    isCoreRoutineTextureEvent(payload) ||
    routineGroup === "core" ||
    oldRoutineGroup === "core";

  if (slug) {
    tags.add(`product:${slug}`);
    paths.add(`/products/${slug}`);
  }
  if (oldSlug && oldSlug !== slug) {
    tags.add(`product:${oldSlug}`);
    paths.add(`/products/${oldSlug}`);
  }
  if (!pdpOnlyMedia && collection) tags.add(collectionCacheTag(collection));
  if (!pdpOnlyMedia && oldCollection && oldCollection !== collection) {
    tags.add(collectionCacheTag(oldCollection));
  }
  if (payload.table === "products") paths.add("/sitemap.xml");
  if (affectsCoreRoutine) {
    tags.add(CORE_ROUTINE_CACHE_TAG);
    for (const coreSlug of CORE_ROUTINE_PRODUCT_SLUGS) {
      tags.add(`product:${coreSlug}`);
      paths.add(`/products/${coreSlug}`);
    }
  }

  return { tags: [...tags], paths: [...paths] };
}
