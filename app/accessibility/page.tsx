import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/LegalDocumentLayout";
import { accessibilityStatement } from "@/content/legal/accessibility";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: accessibilityStatement.metadataTitle,
  description: accessibilityStatement.description,
  alternates: { canonical: accessibilityStatement.canonical },
  openGraph: {
    title: accessibilityStatement.metadataTitle,
    description: accessibilityStatement.description,
    url: accessibilityStatement.canonical,
    siteName: "Mei Pelle",
    type: "website",
  },
};

export default function AccessibilityPage() {
  return <LegalDocumentLayout document={accessibilityStatement} />;
}

