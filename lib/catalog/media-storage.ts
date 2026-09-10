import { APPROVED_SUPABASE_PROJECT_REF } from "../supabase/project-safety";

export const CATALOG_MEDIA_BUCKET = "helix-catalog";

const ORIGINAL_CATALOG_IMAGE_ORIGIN =
  `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co`;
const ORIGINAL_CATALOG_IMAGE_PATH = new RegExp(
  `^/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/products/` +
    "[a-z0-9]+(?:-[a-z0-9]+)*/primary/original/[a-f0-9]{64}\\.webp$",
);

/** The explicit original path preserves approved image colors without recompression. */
export function requiresOriginalCatalogImage(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      value === `${ORIGINAL_CATALOG_IMAGE_ORIGIN}${url.pathname}` &&
      ORIGINAL_CATALOG_IMAGE_PATH.test(url.pathname)
    );
  } catch {
    return false;
  }
}
