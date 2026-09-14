"use client";

import { useState, type ReactNode } from "react";
import { AdminShell } from "@/components/admin/shell/AdminShell";
import type { AdminModule } from "@/lib/admin/modules";
import { verificationAdminModules } from "./verification-modules";

export function VerificationAdminShell({
  children,
  modules = verificationAdminModules,
  viewPath = "/admin",
}: {
  children: ReactNode;
  modules?: readonly AdminModule[];
  viewPath?: string;
}) {
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  return (
    <AdminShell
      accountLabel="Synthetic verification account"
      modules={modules}
      navigationPath={viewPath}
      signOutAction={() => {
        setActionNotice("Sign out is disabled for synthetic verification.");
      }}
    >
      <p className="admin-dashboard__eyebrow">
        <span>helix Admin</span> · Synthetic verification · No account or catalog changes
      </p>
      {actionNotice ? <p role="status">{actionNotice}</p> : null}
      {children}
    </AdminShell>
  );
}
