import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactPageContent } from "@/components/support/ContactPageContent";
import { SupportIntakeVerification, type SupportIntakeScenario } from "../SupportIntakeVerification";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Support intake verification | helix", robots: { index: false, follow: false } };

export default async function SupportIntakeVerificationPage({ searchParams = Promise.resolve({}) }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.VERCEL || process.env.HELIX_VERIFICATION_ADAPTER !== "1") notFound();
  const query = await searchParams;
  const scenario = query.scenario ?? "photos";
  if (Object.keys(query).some((key) => key !== "scenario") || typeof scenario !== "string"
    || !["photos", "upload-retry"].includes(scenario)) notFound();
  return <main id="content">
    <ContactPageContent verification>
      <SupportIntakeVerification key={scenario} scenario={scenario as SupportIntakeScenario} />
    </ContactPageContent>
  </main>;
}
