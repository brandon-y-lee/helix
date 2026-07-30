import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./admin.css";
import { AdminAccessState } from "@/components/admin/shell/AdminAccessState";
import { AdminShell } from "@/components/admin/shell/AdminShell";
import {
  ADMIN_CAPABILITIES,
  requireAdminCapability,
} from "@/lib/admin/capabilities";
import { getAdminModules } from "@/lib/admin/modules";

export const metadata: Metadata = {
  title: {
    default: "Admin | Mei Pelle",
    template: "%s | Mei Pelle Admin",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await requireAdminCapability(ADMIN_CAPABILITIES.access, {
    returnTo: "/admin",
  });

  if (access.status === "forbidden") {
    return <AdminAccessState state="forbidden" />;
  }

  if (access.status === "unavailable") {
    return <AdminAccessState state="unavailable" />;
  }

  return (
    <AdminShell
      accountLabel={access.principal.email ?? "Authenticated account"}
      modules={getAdminModules()}
    >
      {children}
    </AdminShell>
  );
}
