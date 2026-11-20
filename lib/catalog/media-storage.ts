import { runtimeSupabaseTarget, supabaseOriginForTarget } from "../supabase/project-safety";

export const CATALOG_MEDIA_BUCKET = "helix-catalog";

export function catalogMediaOrigin(): string {
  return supabaseOriginForTarget(runtimeSupabaseTarget());
}

export function containsMediaPathEscape(value: string): boolean {
  const match = /^[a-z][a-z\d+.-]*:\/\/[^/?#]*(?<path>[^?#]*)/i.exec(value);
  let path = match?.groups?.path ?? value.split(/[?#]/, 1)[0] ?? "";
  for (let depth = 0; depth <= value.length; depth += 1) {
    if (/[\\]|%2f|%5c/i.test(path)) return true;
    if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(path)) return true;
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return true;
    }
    if (decoded === path) return false;
    path = decoded;
  }
  return true;
}

/** Published legacy slug paths and current UUID paths belong to this deployment's Storage. */
export function isCatalogProductMediaUrl(value: unknown): value is `https://${string}` {
  if (typeof value !== "string") return false;
  const prefix = `${catalogMediaOrigin()}/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/products/`;
  if (!value.startsWith(prefix) || value.length === prefix.length || containsMediaPathEscape(value)) return false;
  try {
    const url = new URL(value);
    return value === `${url.origin}${url.pathname}`;
  } catch {
    return false;
  }
}

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
  const prefix = `${catalogMediaOrigin()}/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/products/${productId}/`;
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
      value === `${catalogMediaOrigin()}${url.pathname}` &&
      ORIGINAL_CATALOG_IMAGE_PATH.test(url.pathname)
    );
  } catch {
    return false;
  }
}
