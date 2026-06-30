import type { Metadata } from "next";
import Link from "next/link";
import {
  contactInquiryTypes,
  contactIntakeStatus,
  contactPreparationGroups,
} from "@/content/support/contact";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "Contact | Mei Pelle",
  description:
    "Contact routing for Mei Pelle product, System, account, cart, accessibility, privacy, partnership, and general inquiries.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact | Mei Pelle",
    description:
      "Contact routing for Mei Pelle product, System, account, cart, accessibility, privacy, partnership, and general inquiries.",
    url: "/contact",
    siteName: "Mei Pelle",
    type: "website",
  },
};

export default function ContactPage() {
  return (
    <div className="support-page contact-page">
      <header className="support-hero support-hero--split">
        <div>
          <p className="eyebrow">Support</p>
          <h1>CONTACT</h1>
          <p>
            Route product, routine, account, cart, accessibility, privacy, and
            partnership questions without sending unsupported order or payment
            details.
          </p>
        </div>
        <aside>
          <p className="eyebrow">{contactIntakeStatus.heading}</p>
          <p>{contactIntakeStatus.message}</p>
          <Link href="/faq">Read FAQ</Link>
        </aside>
      </header>

      <section className="contact-status" aria-label="Current contact status">
        <h2>Current status</h2>
        <p>
          The site does not include a message form, email submission, or ticket
          creation until a verified support destination is published.
        </p>
        <p>
          For now, use the categories below to identify what information should
          be ready for product, account, accessibility, privacy, wholesale, or
          partnership questions.
        </p>
      </section>

      <section className="contact-layout" aria-label="Contact routing">
        <div className="contact-routing">
          <h2>Inquiry types</h2>
          <ul>
            {contactInquiryTypes.map((type) => (
              <li key={type.value}>
                <strong>{type.label}</strong>
                <span>{type.description}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="contact-prep">
          {contactPreparationGroups.map((group) => (
            <section key={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
          <section>
            <h2>Related policies</h2>
            <ul>
              <li>
                <Link href="/faq">FAQ</Link>
              </li>
              <li>
                <Link href="/privacy">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/accessibility">Accessibility Statement</Link>
              </li>
            </ul>
          </section>
        </div>
      </section>
    </div>
  );
}
