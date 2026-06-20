import type { LegalDocument } from "./types";

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  metadataTitle: "Privacy Policy | Mei-Pelle",
  description:
    "How the Mei-Pelle development storefront handles account, cart, search, and support information.",
  canonical: "/privacy-policy",
  status: "Development draft - current as of June 20, 2026",
  intro:
    "This policy describes the data practices currently implemented in the Mei-Pelle development storefront. It should be reviewed before any public launch, real checkout, marketing email, analytics, or support transport is enabled.",
  sections: [
    {
      id: "scope",
      title: "Scope",
      body: [
        "This policy applies to the Mei-Pelle website and local development storefront. It does not describe future payment, shipping, fulfillment, retail, or marketing systems that have not been implemented.",
      ],
    },
    {
      id: "provided-information",
      title: "Information You Provide",
      body: [
        "Account forms collect an email address, password, and optional first and last name through Supabase authentication and profile records.",
      "The cart stores selected products, variants, quantities, and cart status. The current checkout page is a placeholder and does not collect payment cards, shipping addresses, billing addresses, or order records.",
      "The Contact page validates inquiry details in the browser but does not transmit or store contact messages because no approved support transport is configured.",
        "The footer updates module is non-collecting. Newsletter signup storage and delivery are not configured.",
      ],
    },
    {
      id: "automatic-information",
      title: "Information Collected Automatically",
      body: [
        "Supabase authentication uses cookies to maintain sessions.",
        "Guest carts use a high-entropy HttpOnly cookie named mei_pelle_guest_cart. The server stores only a hashed version of the guest token with cart records.",
        "Product search sends the search term to the configured Algolia index from the browser. Algolia returns storefront-safe product records.",
        "Vercel, Next.js, Supabase, and Algolia may process technical request data needed to host, secure, and operate the site.",
      ],
    },
    {
      id: "use",
      title: "How Information Is Used",
      body: [
        "Information is used to operate account access, password reset, profile updates, product discovery, cart persistence, and security checks.",
        "Mei-Pelle does not currently use the site to send marketing email, personalize advertising, process payments, fulfill orders, or ship products.",
      ],
    },
    {
      id: "providers",
      title: "Service Providers",
      body: [
        "Current providers reflected in the codebase include Supabase for authentication, profile, catalog, and cart data; Algolia for product search; Vercel/Next.js for hosting and application delivery; and Google Fonts for web font delivery.",
      ],
    },
    {
      id: "retention",
      title: "Retention",
      body: [
        "Supabase account and profile data remain until the account or profile is changed or removed through application or administrative processes.",
        "Guest cart tokens are configured for a 60-day cookie lifetime, and guest cart rows include an expiration timestamp.",
        "Specific provider log retention windows are not defined in this repository and require launch review.",
      ],
    },
    {
      id: "choices",
      title: "Your Choices",
      body: [
        "Account holders can access and update profile names through the Account page and can request a password reset through the account forms.",
        "Users can remove cart items or clear the cart through the cart interface.",
        "Cookie Preferences lets users acknowledge the current essential-cookie-only setup. Optional analytics and advertising categories are not active.",
      ],
    },
    {
      id: "state-privacy",
      title: "U.S. State Privacy Requests",
      body: [
        "The current development storefront does not include advertising pixels, cross-context behavioral advertising, or sale/share opt-out technology. See Your Privacy Choices for the current implementation status.",
        "Final state privacy notices, verification workflow, and request intake channels require owner and counsel review before launch.",
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
      id: "changes",
      title: "Changes",
      body: [
        "This policy should be updated whenever Mei-Pelle enables checkout, shipping, customer support transport, analytics, marketing email, advertising technology, or other material data practices.",
      ],
    },
    {
      id: "contact",
      title: "Contact",
      body: [
        "Use the Contact page to identify the appropriate request type. The development site currently does not transmit contact messages until a support transport is configured.",
      ],
    },
  ],
};
