// Server-side reader: builds Algolia search documents from the canonical
// Supabase catalog. Supabase remains the source of truth — this module only
// reads (via the RLS-gated anon client, same as the storefront) and never
// writes. Used by the webhook (rebuild one product) and the reindex endpoint
// (rebuild all).

import { getSupabaseClient } from "@/lib/supabase";
import {
  buildAlgoliaRecord,
  type AlgoliaProductRecord,
  type CatalogProductSource,
} from "@/lib/algolia/record";

// Includes `id` (the Algolia objectID) alongside every storefront-safe field
// the record builder needs.
const SOURCE_SELECT =
  "id, slug, display_name, product_type, badge, " +
  "routine_group, system_step_name, system_steps ( name, position, routine_group ), routine_sort, " +
  "catalog_status, editorial_description, status, swatch_from, swatch_to, sort_order, created_at, " +
  "published_at, updated_at, made_for, good_for, texture, key_ingredients, " +
  "ingredients, concerns, usage_time, search_keywords, " +
  "product_variants ( variant_key, label, price_cents, sort_order, available, inventory_status ), " +
  "product_media ( media_type, url, alt, width, height, role, sort_order, palette_id, placeholder_palette )";

/** All products as Algolia records, in canonical merchandising order. */
export async function fetchAllSearchRecords(): Promise<AlgoliaProductRecord[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(SOURCE_SELECT)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(
      `[search-sync] Failed to read catalog from Supabase: ${error.message}`,
    );
  }

  return (data as unknown as CatalogProductSource[])
    .filter((row) => row.catalog_status === "active")
    .map(buildAlgoliaRecord);
}

/** One product as an Algolia record, or null if it no longer exists. */
export async function fetchSearchRecordById(
  id: string,
): Promise<AlgoliaProductRecord | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(SOURCE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[search-sync] Failed to read product "${id}" from Supabase: ${error.message}`,
    );
  }

  if (!data) return null;
  const row = data as unknown as CatalogProductSource;
  if (row.catalog_status !== "active") return null;
  if (row.published_at && Date.parse(row.published_at) > Date.now()) return null;
  return buildAlgoliaRecord(row);
}
