import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/LegalDocumentLayout";
import { privacyPolicy } from "@/content/legal/privacy";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: privacyPolicy.metadataTitle,
  description: privacyPolicy.description,
  alternates: { canonical: privacyPolicy.canonical },
  openGraph: {
    title: privacyPolicy.metadataTitle,
    description: privacyPolicy.description,
    url: privacyPolicy.canonical,
    siteName: "Mei-Pelle",
    type: "website",
  },
};

export default function PrivacyPage() {
  return <LegalDocumentLayout document={privacyPolicy} />;
}
