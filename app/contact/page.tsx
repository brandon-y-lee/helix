import type { Metadata } from "next";
import { ContactForm } from "@/components/support/ContactForm";
import { ContactPageContent } from "@/components/support/ContactPageContent";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

export const metadata: Metadata = createPublicSiteMetadata({
  title: "Contact | helix",
  description:
    "Get in touch with helix for product, routine, account, accessibility, privacy, and partnership questions. Check current form availability and contact guidance.",
  canonical: "/contact",
});

export default function ContactPage() {
  return <ContactPageContent><ContactForm /></ContactPageContent>;
}
