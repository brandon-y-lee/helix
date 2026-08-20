import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/shell/AdminShell";
import { getAdminModules } from "@/lib/admin/modules";

export const metadata: Metadata = {
  title: "Admin verification | helix",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminVerificationPage() {
  if (
    process.env.VERCEL === "1" ||
    process.env.HELIX_VERIFICATION_ADAPTER !== "1"
  ) {
    notFound();
  }

  return (
    <AdminShell accountLabel="Verification account" modules={getAdminModules()}>
      <section className="admin-dashboard" aria-labelledby="admin-verification-heading">
        <header className="admin-dashboard__header">
          <p className="admin-dashboard__eyebrow">helix Admin</p>
          <h1 id="admin-verification-heading">Admin verification</h1>
          <p>Production-rendered shell for browser verification only.</p>
        </header>
      </section>
    </AdminShell>
  );
}
