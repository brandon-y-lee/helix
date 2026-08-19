import type { LegalDocument } from "./types";

export const termsOfService: LegalDocument = {
  title: "Terms of Service",
  metadataTitle: "Terms of Service | helix",
  description:
    "Prelaunch Terms of Service status for helix account, catalog, sandbox cart, and website features.",
  canonical: "/terms",
  status: "Updated August 19, 2026",
  intro:
    "This page records the current prelaunch service boundary. It is not an operative Terms of Service and does not identify helix as a responsible legal person or entity.",
  sections: [
    {
      id: "publication-status",
      title: "Publication Status",
      body: [
        "Operative Terms of Service cannot be published until a Legal Operator and verified legal contact details exist and the final document has been reviewed.",
        "Using the current site does not turn this prelaunch summary into an agreement with helix. helix is the brand presented by the site, not the absent Legal Operator.",
      ],
    },
    {
      id: "accounts",
      title: "Account Status",
      body: [
        "Account tools are powered by Supabase authentication. Customers can create an Account, confirm an email address, sign in, reset a password, and update optional profile names.",
        "Security controls can restrict access that interferes with the site, bypasses authentication, or attempts to expose private data.",
      ],
    },
    {
      id: "commerce-status",
      title: "Commerce Status",
      body: [
        "Checkout operates only through Stripe sandbox mode. Sandbox transactions can create Order and payment-status records for testing, but they do not create real charges, Shipments, Fulfillment, labels, customer emails, or Trustpilot invitations.",
        "Cart, rewards, referral, shipping, tax, and Order totals are revalidated on the server before sandbox Checkout. Browser-submitted prices, balances, discounts, user IDs, and totals are not authoritative.",
        "Shipping, Return, Exchange, and refund content describes planned service direction only. It does not create a real purchase, Shipment, Return right, refund obligation, or other commerce commitment.",
      ],
    },
    {
      id: "rewards",
      title: "helix rewards and Referrals",
      body: [
        "helix rewards is available only inside the current sandbox experience. It requires an authenticated, email-confirmed Account to earn or redeem test Points, use a Referral Offer, submit eligible private feedback, or receive a Referral Reward.",
        "Test Points have no cash value and cannot be used for a real purchase. Current rules may reserve, release, reverse, or reconcile test Points after sandbox payment and Order state changes.",
        "Private post-purchase feedback is first-party and private. It is not a Trustpilot review, is not published publicly, and receives the same test Points Award regardless of sentiment.",
        "Writing, editing, or deleting a Trustpilot review does not earn Points.",
      ],
    },
    {
      id: "product-information",
      title: "Product Information",
      body: [
        "Product pages, System content, and ingredient notes are cosmetic education, not medical advice, diagnosis, or treatment.",
        "Product availability, Variants, pricing, presentation, ingredient details, and directions may change before live commerce is authorized.",
      ],
    },
    {
      id: "providers",
      title: "Current Providers",
      body: [
        "The site uses providers including Supabase, Stripe, Algolia, Vercel, Next.js, and Google Fonts. Provider-controlled services have their own terms and privacy practices.",
        "Trustpilot invitations are not implemented. Sandbox Orders do not send real Trustpilot invitations.",
      ],
    },
    {
      id: "contact",
      title: "Contact Status",
      body: [
        "No verified public Support Channel or legal contact destination has been published. The Contact page can help prepare inquiry details but cannot submit a Support Inquiry.",
      ],
    },
  ],
};
