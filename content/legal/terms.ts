import type { LegalDocument } from "./types";

export const termsOfService: LegalDocument = {
  title: "Terms of Service",
  metadataTitle: "Terms of Service | Mei-Pelle",
  description:
    "Current terms for using the Mei-Pelle development storefront, account tools, product information, and cart.",
  canonical: "/terms-of-service",
  status: "Development draft - current as of June 20, 2026",
  intro:
    "These terms reflect the current development storefront. They do not create live purchase, shipping, return, warranty, subscription, or payment terms.",
  sections: [
    {
      id: "acceptance",
      title: "Acceptance",
      body: [
        "By using the site, you agree to use it lawfully and consistently with these terms. If you do not agree, do not use the site.",
      ],
    },
    {
      id: "accounts",
      title: "Accounts",
      body: [
        "Account tools are powered by Supabase authentication. You are responsible for using accurate account information and keeping your password secure.",
        "Mei-Pelle may restrict or disable access to accounts used to interfere with the site, bypass security, or misuse the service.",
      ],
    },
    {
      id: "commerce-status",
      title: "Current Commerce Status",
      body: [
        "The site displays product and cart functionality for development. Checkout and real payments are not implemented.",
        "Cart totals are informational until an approved checkout, tax, shipping, fulfillment, and order system is implemented.",
      ],
    },
    {
      id: "product-information",
      title: "Product Information",
      body: [
        "Product pages, Method content, and ingredient notes are educational and cosmetic in nature. They are not medical advice, diagnosis, or treatment.",
        "Product availability, variants, pricing, and presentation may change during active development.",
      ],
    },
    {
      id: "acceptable-use",
      title: "Acceptable Use",
      body: [
        "Do not attempt to disrupt the site, scrape private data, bypass authentication, submit malicious content, or use the site in a way that violates law or harms others.",
      ],
    },
    {
      id: "intellectual-property",
      title: "Intellectual Property",
      body: [
        "The Mei-Pelle name, interface, product presentation, editorial copy, and visual system are intended as original brand materials except where third-party services, fonts, or supplier facts are identified internally.",
      ],
    },
    {
      id: "third-party-services",
      title: "Third-Party Services",
      body: [
        "The site uses providers such as Supabase, Algolia, Vercel/Next.js, and Google Fonts. Those services may process technical information needed to operate the site.",
      ],
    },
    {
      id: "disclaimers",
      title: "Disclaimers",
      body: [
        "The site is provided for development and testing. Mei-Pelle does not promise uninterrupted availability, error-free operation, or that all content is final.",
        "No medical, dermatological, shipping, return, warranty, or purchase guarantee is made by the current development storefront.",
      ],
    },
    {
      id: "changes",
      title: "Changes",
      body: [
        "These terms should be updated before public launch and whenever checkout, order support, returns, subscriptions, or other material functionality is added.",
      ],
    },
    {
      id: "contact",
      title: "Contact",
      body: [
        "Use the Contact page for routing support, accessibility, privacy, partnership, or general inquiries once a support transport is configured.",
      ],
    },
  ],
};

