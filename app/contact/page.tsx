import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/support/ContactForm";
import {
  contactInquiryTypes,
  contactPreparationGroups,
} from "@/content/support/contact";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: "Contact | helix",
  description:
    "Current Support Intake status and preparation guidance for helix product, account, accessibility, privacy, partnership, and general inquiries.",
  canonical: "/contact",
});

export default function ContactPage() {
  return (
    <div className="support-page contact-page">
      <header className="support-hero support-hero--split">
        <div>
          <p className="eyebrow">Support</p>
          <h1>CONTACT</h1>
          <p>
            Product, routine, account, accessibility, privacy, and partnership
            questions. Check the current intake status below to get in touch.
          </p>
        </div>
        <aside>
          <p className="eyebrow">HERE TO HELP</p>
          <p>Find product guidance and current service policies in our frequently asked questions.</p>
          <Link href="/faq">Read FAQ</Link>
        </aside>
      </header>

      <section className="contact-status" aria-label="Current contact status">
        <ContactForm />
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
