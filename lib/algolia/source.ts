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
  "id, slug, name, display_name, formal_title, tagline, card_tagline, collection, " +
  "action_name, routine_number, subtitle, descriptor, product_type, badge, " +
  "catalog_status, blurb, description, editorial_description, editorial_how_to_use, " +
  "status, swatch_from, swatch_to, position, featured_rank, sort_order, created_at, " +
  "published_at, updated_at, made_for, good_for, texture, key_ingredients, " +
  "ingredients, concerns, routine_step, usage_time, search_keywords, " +
  "product_variants ( variant_key, label, price_cents, position, sort_order, available, inventory_status ), " +
  "product_media ( media_kind, url, alt, role, sort_order, palette_id, placeholder_palette )";

/** All products as Algolia records, in featured (position) order. */
export async function fetchAllSearchRecords(): Promise<AlgoliaProductRecord[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(SOURCE_SELECT)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true });

  if (error) {
    throw new Error(
      `[search-sync] Failed to read catalog from Supabase: ${error.message}`,
    );
  }

  return (data as unknown as CatalogProductSource[]).map(buildAlgoliaRecord);
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
  return buildAlgoliaRecord(data as unknown as CatalogProductSource);
}
