"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/account/actions";
import { AdminNavigation } from "@/components/admin/shell/AdminNavigation";
import { Sheet } from "@/components/Sheet";
import type { AdminModule } from "@/lib/admin/modules";

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
}: {
  accountLabel: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`admin-account${compact ? " admin-account--compact" : ""}`}
    >
      <div className="admin-account__identity">
        <span className="admin-account__label">Signed in</span>
        <span className="admin-account__value">{accountLabel}</span>
      </div>
      <form action={signOutAction}>
        <button type="submit" className="admin-account__signout">
          Sign out
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

  return (
    <div className="admin-shell">
      <a className="admin-skip-link" href="#admin-content">
        Skip to admin content
      </a>

      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand__wordmark">MEI PELLE</span>
          <span className="admin-brand__label">ADMIN</span>
        </div>
        <AdminNavigation pathname={pathname} modules={modules} />
        <AdminAccount accountLabel={accountLabel} />
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
          <span className="admin-mobile-header__brand">MEI PELLE ADMIN</span>
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
        description="Navigate Mei Pelle internal tools."
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
