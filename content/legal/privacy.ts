import type { LegalDocument } from "./types";

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  metadataTitle: "Privacy Policy | Mei-Pelle",
  description:
    "How Mei-Pelle handles account, cart, search, cookie, support-intake, and provider data.",
  canonical: "/privacy",
  status: "Last updated June 24, 2026",
  intro:
    "This Privacy Policy explains how Mei-Pelle handles information through this website. It reflects the account, cart, search, cookie, and support-intake behavior implemented for the current site.",
  sections: [
    {
      id: "scope",
      title: "Scope",
      body: [
        "This policy applies to the Mei-Pelle website. It does not cover third-party websites or services that Mei-Pelle does not control.",
        "Online checkout is not available yet, so the site does not collect payment card numbers, shipping addresses, billing addresses, taxes, fulfillment records, or live order records.",
      ],
    },
    {
      id: "information-you-provide",
      title: "Information You Provide",
      body: [
        "Account forms collect an email address, password, and optional first and last name through Supabase authentication and profile records.",
        "Cart tools store selected products, variants, quantities, and cart status so you can review a routine before checkout is available.",
        "The Contact page explains inquiry categories and preparation details. It does not submit or store messages because Mei-Pelle has not published a verified public support destination yet.",
        "Newsletter signup is not open. The footer updates module does not collect email addresses.",
      ],
    },
    {
      id: "automatic-information",
      title: "Information Collected Automatically",
      body: [
        "Supabase authentication uses cookies to maintain sessions.",
        "Guest carts use a high-entropy HttpOnly cookie named mei_pelle_guest_cart. The server stores only a hashed version of the guest token with cart records.",
        "Product search sends the search term to the configured Algolia index from the browser and receives storefront product records in response.",
        "Vercel, Next.js, Supabase, Algolia, and Google Fonts may process technical request data needed to host, secure, operate, and display the site.",
      ],
    },
    {
      id: "use",
      title: "How Information Is Used",
      body: [
        "Information is used to operate account access, password reset, profile updates, product discovery, cart persistence, security checks, and site reliability.",
        "Mei-Pelle does not currently use the site to process payments, ship products, fulfill orders, send marketing email, personalize advertising, or run a rewards program.",
      ],
    },
    {
      id: "providers",
      title: "Service Providers",
      body: [
        "Current providers reflected in the codebase include Supabase for authentication, profile, catalog, and cart data; Algolia for product search; Vercel and Next.js for hosting and application delivery; and Google Fonts for web font delivery.",
        "Providers process information only as needed to provide their services to Mei-Pelle, subject to their own terms and privacy practices.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies and Browser Storage",
      body: [
        "Essential cookies support authentication, guest cart continuity, cookie-preference state, and security. Optional analytics and advertising categories are not active.",
        "You can review the Cookie Policy and Cookie Preferences controls from the footer.",
      ],
    },
    {
      id: "retention",
      title: "Retention",
      body: [
        "Supabase account and profile data remain until the account or profile is changed or removed through application or administrative processes.",
        "Guest cart tokens are configured for a 60-day cookie lifetime, and guest cart rows include an expiration timestamp.",
        "Provider log retention periods are controlled by the applicable provider and should be reviewed before launch milestones that add checkout, support intake, marketing, analytics, or advertising tools.",
      ],
    },
    {
      id: "choices",
      title: "Your Choices",
      body: [
        "Account holders can access and update profile names through the Account page and can request a password reset through the account forms.",
        "Users can remove cart items or clear the cart through the cart interface.",
        "Cookie Preferences lets users review the current essential-cookie setup. Your Privacy Choices explains the current state of sale, sharing, and targeted advertising controls.",
      ],
    },
    {
      id: "state-privacy",
      title: "U.S. State Privacy Requests",
      body: [
        "The site does not currently include advertising pixels, cross-context behavioral advertising, sale/share technology, or targeted-advertising opt-out technology.",
        "Mei-Pelle should publish a verified privacy request channel before collecting support messages, enabling marketing email, or launching checkout.",
      ],
    },
    {
      id: "children",
      title: "Children",
      body: [
        "The site is intended for adults and is not designed to collect information from children.",
      ],
    },
    {
      id: "security",
      title: "Security",
      body: [
        "Mei-Pelle uses technical and organizational safeguards appropriate to the site features currently implemented. No website can guarantee absolute security.",
        "Do not send card numbers, passwords, health records, or other sensitive information through unofficial channels.",
      ],
    },
    {
      id: "changes",
      title: "Changes",
      body: [
        "Mei-Pelle may update this policy as features, providers, or legal requirements change. Material changes should be reviewed before public release.",
      ],
    },
    {
      id: "contact",
      title: "Contact",
      body: [
        "Use the Contact page to review the current request categories while Mei-Pelle finalizes a verified public support and privacy intake channel.",
      ],
    },
  ],
};
