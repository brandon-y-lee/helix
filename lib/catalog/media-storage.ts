import { APPROVED_SUPABASE_PROJECT_REF } from "../supabase/project-safety";

export const CATALOG_MEDIA_BUCKET = "helix-catalog";

export const CATALOG_MEDIA_ORIGIN =
  `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co`;
const PRODUCT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURRENT_MEDIA_SUFFIX = new RegExp(
  "^(?:(?:primary|card-hover|core-routine-editorial|core-routine-texture|" +
    "gallery|ingredients-texture|outcomes|profile|application|routine|drafts)/" +
    "[a-f0-9]{64}\\.(?:jpg|png|webp|mp4)|primary/original/[a-f0-9]{64}\\.webp)$",
);

/** Current media addresses retain their owning Product identity across renames. */
export function isCurrentProductMediaUrl(
  value: string,
  productId: string,
): boolean {
  if (PRODUCT_ID_PATTERN.exec(productId)?.[0] !== productId) return false;
  const prefix = `${CATALOG_MEDIA_ORIGIN}/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/products/${productId}/`;
  if (!value.startsWith(prefix)) return false;
  const suffix = value.slice(prefix.length);
  return CURRENT_MEDIA_SUFFIX.exec(suffix)?.[0] === suffix;
}

const ORIGINAL_CATALOG_IMAGE_PATH = new RegExp(
  `^/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/products/` +
    "[a-z0-9]+(?:-[a-z0-9]+)*/primary/original/[a-f0-9]{64}\\.webp$",
);

/** The explicit original path preserves approved image colors without recompression. */
export function requiresOriginalCatalogImage(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      value === `${CATALOG_MEDIA_ORIGIN}${url.pathname}` &&
      ORIGINAL_CATALOG_IMAGE_PATH.test(url.pathname)
    );
  } catch {
    return false;
  }
}
