import type { Metadata } from "next";
import { PolicyDocumentLayout } from "@/components/content/PolicyDocumentLayout";
import { accessibilityStatement } from "@/content/legal/accessibility";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: accessibilityStatement.metadataTitle,
  description: accessibilityStatement.description,
  canonical: accessibilityStatement.canonical,
});

export default function AccessibilityPage() {
  return <PolicyDocumentLayout document={accessibilityStatement} />;
}
