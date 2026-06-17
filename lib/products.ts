// Catalog domain types and shared formatting helpers.
//
// The catalog data itself lives in Supabase (see lib/catalog.ts and the
// "catalog"/"seed_catalog" migrations) — there is no static product list here.

export type Variant = {
  id: string;
  label: string;
  /** Price in whole USD cents. */
  price: number;
};

export type Product = {
  slug: string;
  name: string;
  tagline: string;
  collection: string;
  /** Short marketing blurb shown on cards. */
  blurb: string;
  /** Longer description shown on the detail page. */
  description: string;
  /** Key benefits / "what it does" bullets. */
  benefits: string[];
  /** How-to-use guidance. */
  howToUse: string;
  variants: Variant[];
  /** Decorative gradient stops used in place of product photography. */
  swatch: [string, string];
};

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
