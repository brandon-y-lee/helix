import type { Metadata } from "next";
import Link from "next/link";
import { PolicyDocumentLayout } from "@/components/content/PolicyDocumentLayout";
import { PrivacyChoicesDialog } from "@/components/privacy/PrivacyChoicesDialog";
import {
  cookiePolicy,
  requiredCookies,
  browserStorage,
} from "@/content/legal/cookies";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: cookiePolicy.metadataTitle,
  description: cookiePolicy.description,
  canonical: cookiePolicy.canonical,
});

export default function CookiePolicyPage() {
  return (
    <PolicyDocumentLayout
      document={{
        ...cookiePolicy,
        variant: "document",
        content: (
          <>
            <h1>Cookie Policy</h1>
            <p data-policy-gap="large" data-policy-tone="muted">
              {cookiePolicy.status}
            </p>
            <p data-policy-gap="large" data-policy-tone="muted">
              {cookiePolicy.intro}
            </p>
            {cookiePolicy.sections.map((section) => (
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
                {section.id === "required-cookies" && (
                  <>
                    <p data-policy-gap="small" id="cookie-table-cue">
                      Scroll horizontally to view the table on smaller screens.
                    </p>
                    <div
                      className="policy-cookie-table"
                      role="region"
                      aria-label="Required cookies"
                      aria-describedby="cookie-table-cue"
                      tabIndex={0}
                    >
                      <table aria-label="Required cookies">
                        <thead>
                          <tr>
                            <th scope="col">Name</th>
                            <th scope="col">Function</th>
                            <th scope="col">Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {requiredCookies.map((cookie) => (
                            <tr key={cookie.name}>
                              <th scope="row">{cookie.name}</th>
                              <td>{cookie.purpose}</td>
                              <td>{cookie.duration}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {section.id === "optional-storage" && (
                  <div
                    className="policy-cookie-table"
                    role="region"
                    aria-label="Browser storage and optional services"
                    tabIndex={0}
                  >
                    <table aria-label="Browser storage and optional services">
                      <thead>
                        <tr>
                          <th scope="col">Name</th>
                          <th scope="col">Function</th>
                          <th scope="col">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {browserStorage.map((row) => (
                          <tr key={row.name}>
                            <th scope="row">{row.name}</th>
                            <td>{row.purpose}</td>
                            <td>{row.duration}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {section.id === "your-choices" && (
                  <PrivacyChoicesDialog triggerClassName="policy-privacy-trigger" />
                )}
                {section.id === "contact" && (
                  <p>
                    <a
                      href="mailto:support@helixskin.com"
                      data-policy-link="email"
                    >
                      support@helixskin.com
                    </a>{" "}
                    · <Link href="/privacy">Privacy Policy</Link>
                  </p>
                )}
                {section.id === "other-services" && (
                  <p>
                    <a href="https://stripe.com/privacy">
                      Stripe Privacy Policy
                    </a>{" "}
                    ·{" "}
                    <a href="https://stripe.com/legal/cookies-policy">
                      Stripe Cookie Policy
                    </a>
                  </p>
                )}
              </section>
            ))}
          </>
        ),
      }}
    />
  );
}
