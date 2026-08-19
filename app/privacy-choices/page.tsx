import type { Metadata } from "next";
import Link from "next/link";
import { CookiePreferencesDialog } from "@/components/privacy/CookiePreferencesDialog";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
import { privacyChoices } from "@/content/legal/privacy-choices";
import { resolvePublicSiteOrigin } from "@/lib/site-url";

const siteUrl = new URL(resolvePublicSiteOrigin());

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: privacyChoices.metadataTitle,
  description: privacyChoices.description,
  alternates: { canonical: privacyChoices.canonical },
  openGraph: {
    title: privacyChoices.metadataTitle,
    description: privacyChoices.description,
    url: privacyChoices.canonical,
    siteName: "Mei Pelle",
    type: "website",
  },
};

export default function PrivacyChoicesPage() {
  return (
    <LegalDocumentLayout document={privacyChoices}>
      <div className="privacy-choice-panel">
        <p>
          Optional analytics and advertising categories are not active. Cookie
          Preferences currently saves an essential-only acknowledgement.
        </p>
        <div className="hero__actions">
          <CookiePreferencesDialog triggerClassName="btn" />
          <Link href="/privacy" className="btn btn--ghost">
            Privacy Policy
          </Link>
        </div>
      </div>
    </LegalDocumentLayout>
  );
}
