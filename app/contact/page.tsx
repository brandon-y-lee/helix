import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";
import { contactInquiryTypes } from "@/content/support/contact";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "Contact | Mei-Pelle",
  description:
    "Contact routing for Mei-Pelle product, Method, account, cart, accessibility, privacy, partnership, and general inquiries.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact | Mei-Pelle",
    description:
      "Contact routing for Mei-Pelle product, Method, account, cart, accessibility, privacy, partnership, and general inquiries.",
    url: "/contact",
    siteName: "Mei-Pelle",
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
          <p className="eyebrow">No order support yet</p>
          <p>
            Real checkout, shipping, returns, payment support, and order history
            are not implemented.
          </p>
          <Link href="/faq">Read FAQ</Link>
        </aside>
      </header>

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
        <ContactForm />
      </section>
    </div>
  );
}

