import type { Metadata } from "next";
import Link from "next/link";
import { CookieAcknowledgementDialog } from "@/components/privacy/CookieAcknowledgementDialog";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
import { privacyChoices } from "@/content/legal/privacy-choices";

export const metadata: Metadata = {
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
          Optional analytics and advertising categories are not active. The
          Cookie notice records only an essential-storage acknowledgement.
        </p>
        <div className="hero__actions">
          <CookieAcknowledgementDialog triggerClassName="btn" />
          <Link href="/privacy" className="btn btn--ghost">
            Privacy Policy
          </Link>
        </div>
      </div>
    </LegalDocumentLayout>
  );
}
