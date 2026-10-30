import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyChoicesDialog } from "@/components/privacy/PrivacyChoicesDialog";
import { PolicyDocumentLayout } from "@/components/content/PolicyDocumentLayout";
import { privacyChoices } from "@/content/legal/privacy-choices";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: privacyChoices.metadataTitle,
  description: privacyChoices.description,
  canonical: privacyChoices.canonical,
});

export default function PrivacyChoicesPage() {
  return (
    <PolicyDocumentLayout
      document={{
        ...privacyChoices,
        variant: "document",
        content: (
          <>
            <h1>{privacyChoices.title}</h1>
            <p data-policy-gap="large" data-policy-tone="muted">
              {privacyChoices.intro}
            </p>
            <PrivacyChoicesDialog triggerClassName="policy-privacy-trigger" />
            {privacyChoices.sections.map((section) => (
              <section id={section.id} key={section.id}>
                <h2>{section.title}</h2>
                {section.body.map((paragraph) => (
                  <p
                    key={paragraph}
                    data-policy-gap="normal"
                    data-policy-tone="muted"
                  >
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
            <p>
              <a href="mailto:support@helixskin.com" data-policy-link="email">
                support@helixskin.com
              </a>{" "}
              · <Link href="/privacy">Privacy Policy</Link> ·{" "}
              <Link href="/cookie-policy">Cookie Policy</Link>
            </p>
          </>
        ),
      }}
    />
  );
}
