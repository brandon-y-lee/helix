import type { Metadata } from "next";
import Link from "next/link";
import { CookiePreferencesDialog } from "@/components/CookiePreferencesDialog";
import { LegalDocumentLayout } from "@/components/LegalDocumentLayout";
import { privacyChoices } from "@/content/legal/privacy-choices";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: privacyChoices.metadataTitle,
  description: privacyChoices.description,
  alternates: { canonical: privacyChoices.canonical },
  openGraph: {
    title: privacyChoices.metadataTitle,
    description: privacyChoices.description,
    url: privacyChoices.canonical,
    siteName: "Mei-Pelle",
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
          <Link href="/privacy-policy" className="btn btn--ghost">
            Privacy Policy
          </Link>
        </div>
      </div>
    </LegalDocumentLayout>
  );
}

