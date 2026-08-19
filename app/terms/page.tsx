import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
import { termsOfService } from "@/content/legal/terms";

export const metadata: Metadata = {
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
