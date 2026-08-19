import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
import { termsOfService } from "@/content/legal/terms";
import { resolvePublicSiteOrigin } from "@/lib/site-url";

const siteUrl = new URL(resolvePublicSiteOrigin());

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: termsOfService.metadataTitle,
  description: termsOfService.description,
  alternates: { canonical: termsOfService.canonical },
  openGraph: {
    title: termsOfService.metadataTitle,
    description: termsOfService.description,
    url: termsOfService.canonical,
    siteName: "Mei Pelle",
    type: "website",
  },
};

export default function TermsPage() {
  return <LegalDocumentLayout document={termsOfService} />;
}
