import type { Metadata } from "next";
import { FAQAccordion } from "@/components/content/FAQAccordion";
import { faqCategories } from "@/content/support/faq";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: "FAQ | helix",
  description:
    "Answers about helix products, accounts, sandbox orders, planned shipping and returns, rewards, contact, and policy status.",
  canonical: "/faq",
});

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
