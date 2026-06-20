import type { Metadata } from "next";
import { FAQAccordion } from "@/components/FAQAccordion";
import { faqCategories } from "@/content/support/faq";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "FAQ | Mei-Pelle",
  description:
    "Answers about Mei-Pelle products, the Method, ingredients, account tools, cart behavior, and contact routing.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ | Mei-Pelle",
    description:
      "Answers about Mei-Pelle products, the Method, ingredients, account tools, cart behavior, and contact routing.",
    url: "/faq",
    siteName: "Mei-Pelle",
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
          Product, Method, account, cart, and privacy answers grounded in the
          current development storefront.
        </p>
      </header>
      <FAQAccordion categories={faqCategories} />
    </div>
  );
}

