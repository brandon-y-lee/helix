import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./admin.css";
import { AdminAccessState } from "@/components/admin/shell/AdminAccessState";
import { AdminRouteShell } from "@/components/admin/shell/AdminRouteShell";
import {
  ADMIN_CAPABILITIES,
  checkAdminCapability,
} from "@/lib/admin/capabilities";
import { authRedirectParam } from "@/lib/auth/redirect";
import { getAdminModules } from "@/lib/admin/modules";
import {
  ADMIN_ROUTE_REQUEST_HEADER,
  adminReturnPath,
} from "@/lib/admin/routes";
import { redirect } from "next/navigation";

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
  const access = await checkAdminCapability(ADMIN_CAPABILITIES.access);

  if (access.status === "unauthenticated") {
    const requestHeaders = await headers();
    redirect(
      authRedirectParam(
        adminReturnPath(requestHeaders.get(ADMIN_ROUTE_REQUEST_HEADER)),
      ),
    );
  }

  if (access.status === "forbidden") {
    return <AdminAccessState state="forbidden" />;
  }

  if (access.status === "unavailable") {
    return <AdminAccessState state="unavailable" />;
  }

  return (
    <AdminRouteShell
      accountLabel={access.principal.email ?? "Authenticated account"}
      modules={getAdminModules()}
    >
      {children}
    </AdminRouteShell>
  );
}
