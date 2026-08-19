import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
import { privacyPolicy } from "@/content/legal/privacy";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: privacyPolicy.metadataTitle,
  description: privacyPolicy.description,
  canonical: privacyPolicy.canonical,
});

export default function PrivacyPage() {
  return <LegalDocumentLayout document={privacyPolicy} />;
}
