import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/admin/shell/AdminDashboard";
import { VerificationAdminShell } from "./VerificationAdminShell";
import { verificationAdminModules } from "./verification-modules";

export const metadata: Metadata = {
  title: "Admin verification | helix",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminVerificationPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (
    process.env.VERCEL === "1" ||
    process.env.HELIX_VERIFICATION_ADAPTER !== "1"
  ) {
    notFound();
  }

  const query = await searchParams;
  if (
    Object.keys(query).some((key) => key !== "scenario") ||
    (query.scenario !== undefined &&
      query.scenario !== "default" &&
      query.scenario !== "empty" &&
      query.scenario !== "unavailable")
  ) {
    notFound();
  }
  const modules =
    query.scenario === "empty"
      ? []
      : query.scenario === "unavailable"
        ? verificationAdminModules.map((module) => ({
            ...module,
            status: "unavailable" as const,
          }))
        : verificationAdminModules;
  return (
    <VerificationAdminShell modules={modules}>
      <AdminDashboard modules={modules} title="Admin verification" />
    </VerificationAdminShell>
  );
}
