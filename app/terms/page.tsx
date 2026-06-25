import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/LegalDocumentLayout";
import { termsOfService } from "@/content/legal/terms";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

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
