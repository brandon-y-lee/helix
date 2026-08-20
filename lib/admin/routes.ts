export type ApplicationRouteMode =
  | "storefront"
  | "standard-admin"
  | "catalog-preview";

export const ADMIN_ROUTE_REQUEST_HEADER = "x-helix-admin-route";

export function adminReturnPath(value: string | null): string {
  if (!value) return "/admin";
  try {
    const parsed = new URL(value, "http://helix.local");
    if (
      parsed.origin !== "http://helix.local" ||
      (parsed.pathname !== "/admin" &&
        !parsed.pathname.startsWith("/admin/"))
    ) {
      return "/admin";
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/admin";
  }
}

export function applicationRouteMode(pathname: string): ApplicationRouteMode {
  if (/^\/admin\/catalog\/preview\/[^/]+\/?$/.test(pathname)) {
    return "catalog-preview";
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return "standard-admin";
  }
  return "storefront";
}
