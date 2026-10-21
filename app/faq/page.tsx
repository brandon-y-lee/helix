import type { Metadata } from "next";
import Image from "next/image";
import styles from "@/components/content/faq.module.css";
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
    <div className={`faq-page ${styles.page}`}>
      <header className="storefront-shell system-hero" aria-labelledby="faq-heading" data-layout-shell="storefront">
        <div className="system-hero__surface">
          <Image src="/media/system/a-new-philosophy-hero-01.webp" alt="" fill priority
            sizes="(max-width: 711px) calc(100vw - 32px), 95.5vw" className="system-hero__image" />
          <div className="system-hero__copy">
            <h1 id="faq-heading">In case you were wondering...</h1>
          </div>
        </div>
      </header>
      <FAQAccordion categories={faqCategories} />
    </div>
  );
}
