import Link from "next/link";
import type { AdminModule } from "@/lib/admin/modules";

function moduleIsCurrent(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function compactLabel(label: string): string {
  return label
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AdminNavigation({
  pathname,
  modules,
  onNavigate,
  collapsed = false,
}: {
  pathname: string;
  modules: readonly AdminModule[];
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  return (
    <nav
      className="admin-navigation"
      aria-label="Admin modules"
      data-collapsed={collapsed || undefined}
    >
      <Link
        href="/admin"
        className="admin-navigation__item"
        aria-current={pathname === "/admin" ? "page" : undefined}
        aria-label={collapsed ? "Overview" : undefined}
        title={collapsed ? "Overview" : undefined}
        onClick={onNavigate}
      >
        <span aria-hidden={collapsed || undefined}>{collapsed ? "OV" : "Overview"}</span>
      </Link>
      {modules.map((module) =>
        module.status === "active" ? (
          <Link
            key={module.id}
            href={module.route}
            className="admin-navigation__item"
            aria-current={
              moduleIsCurrent(pathname, module.route) ? "page" : undefined
            }
            aria-label={collapsed ? module.label : undefined}
            title={collapsed ? module.label : undefined}
            onClick={onNavigate}
          >
            <span aria-hidden={collapsed || undefined}>
              {collapsed ? compactLabel(module.label) : module.label}
            </span>
          </Link>
        ) : (
          <span
            key={module.id}
            className="admin-navigation__item"
            aria-disabled="true"
            aria-label={collapsed ? `${module.label}, unavailable` : undefined}
            title={collapsed ? `${module.label}, unavailable` : undefined}
          >
            <span aria-hidden={collapsed || undefined}>
              {collapsed ? compactLabel(module.label) : module.label}
            </span>
            {collapsed ? null : (
              <span className="admin-navigation__status">Unavailable</span>
            )}
          </span>
        ),
      )}
    </nav>
  );
}
