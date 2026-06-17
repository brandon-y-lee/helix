// Typed catalog data-access layer.
//
// Supabase is the required catalog source — there is no static fallback. A
// missing configuration or a failed query throws a clear, developer-facing
// error so misconfiguration fails fast instead of silently degrading. An empty
// (but reachable) catalog returns no products, and the storefront renders an
// explicit empty state.

import { getSupabaseClient } from "@/lib/supabase";
import type { Product, ProductStatus, Variant } from "@/lib/products";

export { formatPrice } from "@/lib/products";
export type { Product, ProductStatus, Variant } from "@/lib/products";

// Shape returned by the Supabase query (snake_case columns + joined variants).
type ProductRow = {
  slug: string;
  name: string;
  tagline: string;
  collection: string;
  blurb: string;
  description: string;
  benefits: string[] | null;
  how_to_use: string;
  swatch_from: string;
  swatch_to: string;
  status: string;
  made_for: string | null;
  good_for: string | null;
  texture: string | null;
  created_at: string;
  product_variants: VariantRow[] | null;
};

type VariantRow = {
  variant_key: string;
  label: string;
  price_cents: number;
  position: number;
};

const PRODUCT_SELECT =
  "slug, name, tagline, collection, blurb, description, benefits, how_to_use, " +
  "swatch_from, swatch_to, status, made_for, good_for, texture, created_at, " +
  "product_variants ( variant_key, label, price_cents, position )";

const VALID_STATUSES: ProductStatus[] = ["available", "coming_soon", "sold_out"];

function toStatus(value: string): ProductStatus {
  return (VALID_STATUSES as string[]).includes(value)
    ? (value as ProductStatus)
    : "available";
}

function mapRow(row: ProductRow): Product {
  const variants: Variant[] = (row.product_variants ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((v) => ({ id: v.variant_key, label: v.label, price: v.price_cents }));

  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    collection: row.collection,
    blurb: row.blurb,
    description: row.description,
    benefits: row.benefits ?? [],
    howToUse: row.how_to_use,
    variants,
    swatch: [row.swatch_from, row.swatch_to],
    status: toStatus(row.status),
    madeFor: row.made_for,
    goodFor: row.good_for,
    texture: row.texture,
    createdAt: row.created_at,
  };
}

export async function getProducts(): Promise<Product[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(
      `[catalog] Failed to load products from Supabase: ${error.message}. ` +
        `Ensure the catalog schema and seed (migrations "catalog" and "seed_catalog") ` +
        `are applied to the project.`,
    );
  }

  // Reachable but empty → return no products; pages render an empty state.
  return (data as unknown as ProductRow[]).map(mapRow);
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[catalog] Failed to load product "${slug}" from Supabase: ${error.message}. ` +
        `Ensure the catalog schema and seed are applied to the project.`,
    );
  }

  // No row for this slug → genuine not-found (caller renders 404).
  if (!data) return undefined;

  return mapRow(data as unknown as ProductRow);
}

/**
 * Products in the same collection, excluding the current one — the "complete
 * the routine" rail on the PDP. Returns up to `limit` products.
 */
export async function getRelatedProducts(
  collection: string,
  excludeSlug: string,
  limit = 4,
): Promise<Product[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("collection", collection)
    .neq("slug", excludeSlug)
    .order("position", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(
      `[catalog] Failed to load related products for "${collection}": ${error.message}.`,
    );
  }

  return (data as unknown as ProductRow[]).map(mapRow);
}
