"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/account/actions";
import { AdminHelixIdentity } from "@/components/admin/shell/AdminHelixIdentity";
import { AdminNavigation } from "@/components/admin/shell/AdminNavigation";
import { Sheet } from "@/components/overlays/Sheet";
import type { AdminModule } from "@/lib/admin/modules";

const ADMIN_SIDEBAR_PREFERENCE = "helix-admin-sidebar-collapsed";

function currentViewLabel(
  pathname: string,
  modules: readonly AdminModule[],
): string {
  if (pathname === "/admin") return "Overview";
  const current = modules.find(
    (module) =>
      pathname === module.route || pathname.startsWith(`${module.route}/`),
  );
  return current?.label ?? "Admin";
}

function AdminAccount({
  accountLabel,
  compact = false,
  collapsed = false,
}: {
  accountLabel: string;
  compact?: boolean;
  collapsed?: boolean;
}) {
  return (
    <div
      className={`admin-account${compact ? " admin-account--compact" : ""}${collapsed ? " admin-account--collapsed" : ""}`}
    >
      <div
        className="admin-account__identity"
        aria-label={collapsed ? `Signed in as ${accountLabel}` : undefined}
        title={collapsed ? accountLabel : undefined}
      >
        {collapsed ? (
          <span className="admin-account__monogram" aria-hidden="true">
            AC
          </span>
        ) : (
          <>
            <span className="admin-account__label">Signed in</span>
            <span className="admin-account__value">{accountLabel}</span>
          </>
        )}
      </div>
      <form action={signOutAction}>
        <button
          type="submit"
          className="admin-account__signout"
          aria-label={collapsed ? "Sign out" : undefined}
          title={collapsed ? "Sign out" : undefined}
        >
          <span aria-hidden={collapsed || undefined}>
            {collapsed ? "OUT" : "Sign out"}
          </span>
        </button>
      </form>
    </div>
  );
}

export function AdminShell({
  accountLabel,
  modules,
  children,
}: {
  accountLabel: string;
  modules: readonly AdminModule[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeMobileNavigation = useCallback(
    () => setMobileNavigationOpen(false),
    [],
  );
  const restoreMenuFocus = useCallback(
    () => menuButtonRef.current?.focus(),
    [],
  );
  const currentView = currentViewLabel(pathname, modules);

  useEffect(() => {
    setSidebarCollapsed(
      window.localStorage.getItem(ADMIN_SIDEBAR_PREFERENCE) === "true",
    );
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      window.localStorage.setItem(ADMIN_SIDEBAR_PREFERENCE, String(next));
      return next;
    });
  }, []);

  return (
    <div
      className="admin-shell"
      data-sidebar-collapsed={sidebarCollapsed || undefined}
    >
      <a className="admin-skip-link" href="#admin-content">
        Skip to admin content
      </a>

      <aside className="admin-sidebar">
        <AdminHelixIdentity
          className="admin-brand"
          compact={sidebarCollapsed}
          title={sidebarCollapsed ? "helix Admin" : undefined}
        />
        <button
          type="button"
          className="admin-sidebar__toggle"
          aria-label={`${sidebarCollapsed ? "Expand" : "Collapse"} admin sidebar`}
          aria-pressed={sidebarCollapsed}
          title={`${sidebarCollapsed ? "Expand" : "Collapse"} admin sidebar`}
          onClick={toggleSidebar}
        >
          <span aria-hidden="true">{sidebarCollapsed ? ">>" : "<<"}</span>
          {sidebarCollapsed ? null : <span>Collapse</span>}
        </button>
        <AdminNavigation
          pathname={pathname}
          modules={modules}
          collapsed={sidebarCollapsed}
        />
        <AdminAccount
          accountLabel={accountLabel}
          collapsed={sidebarCollapsed}
        />
      </aside>

      <div className="admin-workspace">
        <header className="admin-mobile-header">
          <button
            ref={menuButtonRef}
            type="button"
            className="admin-mobile-header__menu"
            aria-expanded={mobileNavigationOpen}
            aria-controls="admin-mobile-navigation"
            onClick={() => setMobileNavigationOpen(true)}
          >
            Menu
          </button>
          <AdminHelixIdentity
            className="admin-mobile-header__brand"
          />
          <span className="admin-mobile-header__current">{currentView}</span>
        </header>

        <div className="admin-context" aria-label="Current admin module">
          <span>Current view</span>
          <strong>{currentView}</strong>
        </div>

        <main id="admin-content" className="admin-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <Sheet
        open={mobileNavigationOpen}
        side="left"
        title="Admin menu"
        description="Navigate helix internal tools."
        onClose={closeMobileNavigation}
        returnFocus={restoreMenuFocus}
        className="admin-drawer"
      >
        <div id="admin-mobile-navigation" className="admin-drawer__content">
          <AdminNavigation
            pathname={pathname}
            modules={modules}
            onNavigate={closeMobileNavigation}
          />
          <AdminAccount accountLabel={accountLabel} compact />
        </div>
      </Sheet>
    </div>
  );
}
