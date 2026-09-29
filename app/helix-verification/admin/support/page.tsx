import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminModules } from "@/lib/admin/modules";
import { VerificationAdminShell } from "../VerificationAdminShell";
import { SupportConversationVerification, type SupportConversationScenario } from "./SupportConversationVerification";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Private support verification | helix", robots: { index: false, follow: false } };

export default async function SupportConversationVerificationPage({ searchParams = Promise.resolve({}) }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.VERCEL || process.env.HELIX_VERIFICATION_ADAPTER !== "1") notFound();
  const query = await searchParams;
  const scenario = query.scenario ?? "photos";
  if (Object.keys(query).some((key) => key !== "scenario") || typeof scenario !== "string"
    || !["photos", "new-context", "refresh-error", "quarantine"].includes(scenario)) notFound();
  return <VerificationAdminShell modules={getAdminModules(["support.read", "support.reply"])} viewPath="/admin/support" navigationEnabled={false}>
    <SupportConversationVerification key={scenario} scenario={scenario as SupportConversationScenario} />
  </VerificationAdminShell>;
}
