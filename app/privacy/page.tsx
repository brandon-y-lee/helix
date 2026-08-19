import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
import { privacyPolicy } from "@/content/legal/privacy";

export const metadata: Metadata = {
  title: privacyPolicy.metadataTitle,
  description: privacyPolicy.description,
  alternates: { canonical: privacyPolicy.canonical },
  openGraph: {
    title: privacyPolicy.metadataTitle,
    description: privacyPolicy.description,
    url: privacyPolicy.canonical,
    siteName: "Mei Pelle",
    type: "website",
  },
};

export default function PrivacyPage() {
  return <LegalDocumentLayout document={privacyPolicy} />;
}
