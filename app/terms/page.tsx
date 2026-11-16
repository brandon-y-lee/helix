import type { Metadata } from "next";
import { PolicyDocumentLayout } from "@/components/content/PolicyDocumentLayout";
import { termsOfService } from "@/content/legal/terms";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: termsOfService.metadataTitle,
  description: termsOfService.description,
  canonical: termsOfService.canonical,
});

export default function TermsPage() {
  return <PolicyDocumentLayout document={termsOfService} />;
}
