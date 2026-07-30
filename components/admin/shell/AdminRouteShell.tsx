"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/shell/AdminShell";
import type { AdminModule } from "@/lib/admin/modules";
import { applicationRouteMode } from "@/lib/admin/routes";

export function AdminRouteShell({
  accountLabel,
  modules,
  children,
}: {
  accountLabel: string;
  modules: readonly AdminModule[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (applicationRouteMode(pathname) === "catalog-preview") {
    return children;
  }
  return (
    <AdminShell accountLabel={accountLabel} modules={modules}>
      {children}
    </AdminShell>
  );
}
