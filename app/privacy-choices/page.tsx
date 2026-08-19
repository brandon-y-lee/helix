import type { Metadata } from "next";
import Link from "next/link";
import { CookieAcknowledgementDialog } from "@/components/privacy/CookieAcknowledgementDialog";
import { LegalDocumentLayout } from "@/components/content/LegalDocumentLayout";
import { privacyChoices } from "@/content/legal/privacy-choices";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: privacyChoices.metadataTitle,
  description: privacyChoices.description,
  canonical: privacyChoices.canonical,
});

export default function PrivacyChoicesPage() {
  return (
    <LegalDocumentLayout document={privacyChoices}>
      <div className="privacy-choice-panel">
        <p>
          Optional analytics and advertising categories are not active. The
          Cookie notice records only a required and functional storage
          acknowledgement.
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
