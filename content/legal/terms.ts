import type { LegalDocument } from "./types";

export const termsOfService: LegalDocument = {
  title: "Terms of Service",
  metadataTitle: "Terms of Service | Mei Pelle",
  description:
    "Terms for using Mei Pelle account tools, product information, cart features, and website content.",
  canonical: "/terms",
  status: "Last updated June 24, 2026",
  intro:
    "These Terms of Service govern use of the Mei Pelle website, including account tools, product information, cart features, and support-policy content.",
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
        "Mei Pelle may restrict or disable access to accounts used to interfere with the site, bypass security, misuse the service, or violate these terms.",
      ],
    },
    {
      id: "commerce-status",
      title: "Commerce Status",
      body: [
        "Checkout operates only through Stripe sandbox mode. Sandbox transactions can create order records and payment-status simulations, but they do not create real charges, shipments, fulfillment, labels, customer emails, or Trustpilot invitations.",
        "Cart, reward, referral, shipping, tax, and order totals are revalidated on the server before Stripe Checkout. Browser-submitted prices, balances, discounts, user IDs, and totals are not authoritative.",
        "Shipping, return, and refund content on the FAQ describes policy direction for the sandbox commerce flow and does not create a real shipment obligation without a future approved live-order launch.",
      ],
    },
    {
      id: "rewards",
      title: "Rewards and Referrals",
      body: [
        "MEI PELLE REWARDS requires an authenticated, confirmed account to earn points, redeem points, use referral offers, submit eligible private feedback, or receive referral rewards.",
        "Points have no cash value, are not transferable, do not currently expire, and may be adjusted or reversed after cancellations, failed payments, expirations, refunds, abuse, or reconciliation issues.",
        "Checkout may apply at most one internal points reward or one referral offer. Rewards and referral offers do not stack with each other.",
        "Private post-purchase feedback is first-party, private, and earns the same points regardless of sentiment. It is not a Trustpilot review and is not published publicly.",
        "Mei Pelle does not award points for writing, editing, or deleting Trustpilot reviews.",
      ],
    },
    {
      id: "product-information",
      title: "Product Information",
      body: [
        "Product pages, System content, and ingredient notes are educational and cosmetic in nature. They are not medical advice, diagnosis, or treatment.",
        "Product availability, variants, pricing, presentation, ingredient details, and directions may change.",
      ],
    },
    {
      id: "acceptable-use",
      title: "Acceptable Use",
      body: [
        "Do not attempt to disrupt the site, scrape private data, bypass authentication, submit malicious content, reverse engineer restricted areas, or use the site in a way that violates law or harms others.",
      ],
    },
    {
      id: "intellectual-property",
      title: "Intellectual Property",
      body: [
        "The Mei Pelle name, interface, product presentation, editorial copy, and visual system are intended as original brand materials except where third-party services, fonts, or supplier facts are identified.",
        "You may not copy, modify, distribute, sell, or exploit site content except as allowed by law or with written permission.",
      ],
    },
    {
      id: "third-party-services",
      title: "Third-Party Services",
      body: [
        "The site uses providers such as Supabase, Stripe, Algolia, Vercel/Next.js, and Google Fonts. Those services may process technical information needed to operate the site.",
        "Trustpilot is a future neutral invitation boundary only in the current codebase. Sandbox orders do not send real Trustpilot invitations.",
        "Third-party services have their own terms and privacy practices. Mei Pelle is not responsible for services it does not control.",
      ],
    },
    {
      id: "disclaimers",
      title: "Disclaimers",
      body: [
        "The site is provided as available. Mei Pelle does not promise uninterrupted availability, error-free operation, or that all content will remain unchanged.",
        "To the fullest extent allowed by law, Mei Pelle disclaims warranties not expressly stated in these terms.",
      ],
    },
    {
      id: "liability",
      title: "Limitation of Liability",
      body: [
        "To the fullest extent allowed by law, Mei Pelle will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages arising from site use.",
        "Nothing in these terms limits rights that cannot be limited under applicable law.",
      ],
    },
    {
      id: "changes",
      title: "Changes",
      body: [
        "Mei Pelle may update these terms as features, providers, or legal requirements change. Material updates should be reviewed before public release.",
      ],
    },
    {
      id: "contact",
      title: "Contact",
      body: [
        "Use the Contact page to review support, accessibility, privacy, partnership, wholesale, and general inquiry categories while Mei Pelle finalizes a verified public intake channel.",
      ],
    },
  ],
};
