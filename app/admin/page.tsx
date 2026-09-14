import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/shell/AdminDashboard";
import { getAdminModules } from "@/lib/admin/modules";

export const metadata: Metadata = {
  title: "Overview",
};

export default function AdminPage() {
  return <AdminDashboard modules={getAdminModules()} />;
}
