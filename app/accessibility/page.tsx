import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
import { accessibilityStatement } from "@/content/legal/accessibility";

export const metadata: Metadata = {
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
