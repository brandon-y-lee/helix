import type { Metadata } from "next";
import { FAQAccordion } from "@/components/FAQAccordion";
import { faqCategories } from "@/content/support/faq";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "FAQ | Mei Pelle",
  description:
    "Answers about Mei Pelle products, accounts, orders, shipping, returns, rewards, contact, and policies.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ | Mei Pelle",
    description:
      "Answers about Mei Pelle products, accounts, orders, shipping, returns, rewards, contact, and policies.",
    url: "/faq",
    siteName: "Mei Pelle",
    type: "website",
  },
};

export default function FAQPage() {
  return (
    <div className="support-page faq-page">
      <header className="support-hero">
        <p className="eyebrow">Support</p>
        <h1>FAQ</h1>
        <p>
          Product, account, order, shipping, return, rewards, contact, and
          policy answers in one place.
        </p>
      </header>
      <FAQAccordion categories={faqCategories} />
    </div>
  );
}
