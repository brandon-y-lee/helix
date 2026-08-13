import { assertApprovedSupabaseProjectUrl } from "@/lib/supabase/project-safety";
import {
  StorefrontBaselineError,
  type StorefrontCatalogProduct,
  type StorefrontCatalogReadAdapter,
  type StorefrontCatalogRoutineComplement,
} from "@/test-support/storefront-baseline";

const PRODUCT_SELECT = [
  "id",
  "slug",
  "display_name",
  "product_type",
  "badge",
  "currency",
  "catalog_status",
  "status",
  "editorial_description",
  "swatch_from",
  "swatch_to",
  "sort_order",
  "created_at",
  "published_at",
  "updated_at",
  "made_for",
  "good_for",
  "texture",
  "key_ingredients",
  "ingredients",
  "concerns",
  "usage_time",
  "search_keywords",
  "routine_group",
  "system_step_name",
  "system_steps(name,position,routine_group)",
  "routine_sort",
  "product_variants(variant_key,label,price_cents,sort_order,available,inventory_status)",
  "product_media(media_type,url,alt,width,height,role,sort_order,palette_id,placeholder_palette)",
  "product_family_memberships!product_family_memberships_product_id_fkey(family_id,is_entry)",
].join(",");

const ROUTINE_COMPLEMENT_SELECT =
  "product_id,related_product_id,relationship_type,sort_order";

type AdapterOptions = {
  url: string;
  anonKey: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

async function readJsonArray<T>(
  fetchImpl: typeof fetch,
  input: URL,
  anonKey: string,
  signal: AbortSignal | undefined,
  subject: string,
): Promise<T[]> {
  let response: Response;
  try {
    response = await fetchImpl(input, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      signal,
    });
  } catch (cause) {
    if (
      cause &&
      typeof cause === "object" &&
      "name" in cause &&
      cause.name === "AbortError"
    ) {
      throw new StorefrontBaselineError(
        "catalog-read-timeout",
        "The approved Supabase Catalog read timed out.",
        { cause },
      );
    }
    throw new StorefrontBaselineError(
      "catalog-read-failed",
      `${subject} query could not reach the approved Supabase project.`,
      { cause },
    );
  }
  if (!response.ok) {
    throw new StorefrontBaselineError(
      "catalog-read-failed",
      `${subject} query failed (HTTP ${response.status}).`,
    );
  }
  const value: unknown = await response.json();
  if (!Array.isArray(value)) {
    throw new StorefrontBaselineError(
      "catalog-read-failed",
      `${subject} query returned an invalid response shape.`,
    );
  }
  return value as T[];
}

export function createSupabaseStorefrontCatalogAdapter({
  url,
  anonKey,
  signal,
  fetchImpl = fetch,
}: AdapterOptions): StorefrontCatalogReadAdapter {
  assertApprovedSupabaseProjectUrl(url);
  const baseUrl = new URL(url);

  return {
    approvedMediaOrigin: baseUrl.origin,
    async readCatalog() {
      const productsUrl = new URL("/rest/v1/products", baseUrl);
      productsUrl.search = new URLSearchParams({
        select: PRODUCT_SELECT,
        catalog_status: "eq.active",
        "product_variants.archived_at": "is.null",
        "product_media.archived_at": "is.null",
        order: "routine_sort.asc,sort_order.asc,slug.asc",
      }).toString();
      const complementsUrl = new URL("/rest/v1/product_relationships", baseUrl);
      complementsUrl.search = new URLSearchParams({
        select: ROUTINE_COMPLEMENT_SELECT,
        relationship_type: "eq.complete_the_routine",
        archived_at: "is.null",
        order: "product_id.asc,sort_order.asc,related_product_id.asc",
      }).toString();

      const [products, routineComplements] = await Promise.all([
        readJsonArray<StorefrontCatalogProduct>(
          fetchImpl,
          productsUrl,
          anonKey,
          signal,
          "catalog",
        ),
        readJsonArray<StorefrontCatalogRoutineComplement>(
          fetchImpl,
          complementsUrl,
          anonKey,
          signal,
          "Routine Complements",
        ),
      ]);
      return { products, routineComplements };
    },
  };
}
