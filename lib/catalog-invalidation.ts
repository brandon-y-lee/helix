import type {
  CatalogWebhookPayload,
  SyncOutcome,
} from "@/lib/algolia/sync";
import { collectionCacheTag } from "@/lib/catalog-cache";

export type CatalogInvalidationTargets = {
  tags: string[];
  paths: string[];
};

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function getCatalogInvalidationTargets(
  payload: CatalogWebhookPayload,
  outcome?: SyncOutcome,
): CatalogInvalidationTargets {
  const tags = new Set(["catalog", "products", "collections"]);
  const paths = new Set(["/", "/products"]);
  const source = payload.record ?? payload.old_record;
  const slug = outcome?.slug ?? asText(source?.slug);
  const collection = outcome?.collection ?? asText(source?.collection);

  if (slug) {
    tags.add(`product:${slug}`);
    paths.add(`/products/${slug}`);
  }
  if (collection) tags.add(collectionCacheTag(collection));

  return { tags: [...tags], paths: [...paths] };
}
