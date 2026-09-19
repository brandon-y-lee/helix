import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminAccessState } from "@/components/admin/shell/AdminAccessState";
import { AdminDashboard } from "@/components/admin/shell/AdminDashboard";
import {
  ADMIN_CAPABILITIES,
  checkAdminCapability,
} from "@/lib/admin/capabilities";
import { getAdminModules } from "@/lib/admin/modules";
import { authRedirectParam } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function AdminPage() {
  const access = await checkAdminCapability(ADMIN_CAPABILITIES.access);

  if (access.status === "unauthenticated") {
    redirect(authRedirectParam("/admin"));
  }
  if (access.status === "forbidden") {
    return <AdminAccessState state="forbidden" />;
  }
  if (access.status === "unavailable") {
    return <AdminAccessState state="unavailable" />;
  }

  return <AdminDashboard modules={getAdminModules(access.access.capabilities)} />;
}
