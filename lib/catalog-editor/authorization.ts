import "server-only";

import {
  getCurrentClaims,
  type VerifiedAuthClaims,
} from "@/lib/auth/session";

export const CATALOG_PREVIEW_PERMISSION = "catalog.read";

export type CatalogPreviewAuthorization =
  | { status: "authorized"; claims: VerifiedAuthClaims }
  | { status: "anonymous" }
  | { status: "denied" }
  | { status: "unavailable" };

function permissionValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((permission): permission is string =>
        typeof permission === "string",
      )
    : [];
}

export function hasCatalogPreviewPermission(claims: VerifiedAuthClaims) {
  const appMetadata =
    claims.app_metadata &&
    typeof claims.app_metadata === "object" &&
    !Array.isArray(claims.app_metadata)
      ? (claims.app_metadata as Record<string, unknown>)
      : null;
  const permissions = new Set([
    ...permissionValues(claims.permissions),
    ...permissionValues(appMetadata?.permissions),
  ]);

  return permissions.has(CATALOG_PREVIEW_PERMISSION);
}

export async function authorizeCatalogPreview(
  loadClaims: () => Promise<VerifiedAuthClaims | null> = getCurrentClaims,
): Promise<CatalogPreviewAuthorization> {
  try {
    const claims = await loadClaims();
    if (!claims) return { status: "anonymous" };
    if (!hasCatalogPreviewPermission(claims)) return { status: "denied" };
    return { status: "authorized", claims };
  } catch {
    return { status: "unavailable" };
  }
}
