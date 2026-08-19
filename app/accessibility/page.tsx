import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
import { accessibilityStatement } from "@/content/legal/accessibility";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: accessibilityStatement.metadataTitle,
  description: accessibilityStatement.description,
  canonical: accessibilityStatement.canonical,
});

export default function AccessibilityPage() {
  return <LegalDocumentLayout document={accessibilityStatement} />;
}
