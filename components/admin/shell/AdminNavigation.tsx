import Link from "next/link";
import type { AdminModule } from "@/lib/admin/modules";

function moduleIsCurrent(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function AdminNavigation({
  pathname,
  modules,
  onNavigate,
}: {
  pathname: string;
  modules: readonly AdminModule[];
  onNavigate?: () => void;
}) {
  return (
    <nav className="admin-navigation" aria-label="Admin modules">
      <Link
        href="/admin"
        className="admin-navigation__item"
        aria-current={pathname === "/admin" ? "page" : undefined}
        onClick={onNavigate}
      >
        Overview
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
            onClick={onNavigate}
          >
            {module.label}
          </Link>
        ) : (
          <span
            key={module.id}
            className="admin-navigation__item"
            aria-disabled="true"
          >
            <span>{module.label}</span>
            <span className="admin-navigation__status">Unavailable</span>
          </span>
        ),
      )}
    </nav>
  );
}
