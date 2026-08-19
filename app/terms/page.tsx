import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
import { termsOfService } from "@/content/legal/terms";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: termsOfService.metadataTitle,
  description: termsOfService.description,
  canonical: termsOfService.canonical,
});

export default function TermsPage() {
  return <LegalDocumentLayout document={termsOfService} />;
}
