import type { LegalDocument } from "./types";
import { supportPolicy } from "@/content/support/policy";

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  metadataTitle: "Privacy Policy | helix",
  description:
    "Current account, Cart, search, sandbox Checkout, rewards, referral, private-feedback, browser-storage, and provider data practices on the helix Platform.",
  canonical: "/privacy",
  status: "Updated August 19, 2026",
  intro:
    "This page is a factual prelaunch summary of information processing currently implemented on the helix Platform. It is not an operative Privacy Policy until a Legal Operator and verified legal contact details exist.",
  sections: [
    {
      id: "scope",
      title: "Scope",
      body: [
        "This summary covers the helix Public Site. It does not cover third-party websites or provider-controlled services.",
        "Checkout operates only in Stripe sandbox mode. The site creates sandbox Order records and may receive sandbox shipping, billing, tax, and payment-status details from Stripe, but the application does not store payment-card numbers or create real Fulfillment records from sandbox Orders.",
      ],
    },
    {
      id: "information-you-provide",
      title: "Information You Provide",
      body: [
        "Account forms collect an email address, password, and optional first and last name through Supabase authentication and profile records.",
        "Cart tools store selected products, variants, quantities, and cart status so you can review a routine before sandbox Checkout.",
        "Sandbox order records store order numbers, item snapshots, Stripe Checkout Session and PaymentIntent identifiers, checkout status, shipping and billing snapshots, reward and referral references, totals, and timestamps.",
        "Helix rewards, referrals, and private feedback store Available Points Balances, Points Ledger entries, Referral Codes, Referral Attributions, one-time Referral Rewards, private first-party feedback responses, and reward issuance status.",
        `The Contact page explains Inquiry Types and preparation details. ${supportPolicy.contactStatus} The page does not submit or store messages.`,
        "Newsletter signup is not open. The footer updates module does not collect email addresses.",
      ],
    },
    {
      id: "automatic-information",
      title: "Information Collected Automatically",
      body: [
        "Supabase authentication uses cookies to maintain sessions.",
        "Guest Carts use a high-entropy HttpOnly cookie named helix_guest_cart. The server stores only a hashed version of the guest token with Cart records.",
        "Product search sends the search term to the configured Algolia index from the browser and receives storefront product records in response.",
        "Eligible product pages load Stripe's Payment Method Messaging Element. Stripe may receive technical data such as an IP address, browser details, cookies, and interactions needed to determine eligibility and render current payment-method information.",
        "Vercel, Next.js, Supabase, Algolia, and Google Fonts may process technical request data needed to host, secure, operate, and display the site.",
      ],
    },
    {
      id: "use",
      title: "How Information Is Used",
      body: [
        "Information is used to operate account access, password reset, profile updates, product discovery, cart persistence, sandbox Checkout, order history, rewards, referrals, private feedback, security checks, and site reliability.",
        "Sandbox Checkout is used for payment simulation only. Sandbox Orders do not ship Products, purchase labels, send live Customer communications, send real Trustpilot invitations, personalize advertising, or process live payments.",
      ],
    },
    {
      id: "providers",
      title: "Service Providers",
      body: [
        "Current providers reflected in the codebase include Supabase for authentication, profile, catalog, cart, order, reward, referral, and private-feedback data; Stripe for sandbox Checkout, payment status, and eligible product-page payment-method messaging; Algolia for product search; Vercel and Next.js for hosting and application delivery; and Google Fonts for web font delivery.",
        "Trustpilot invitations are not implemented in the current codebase. Sandbox orders do not send real Trustpilot invitations, and reward points are never conditioned on Trustpilot activity.",
        "Providers process information needed to deliver their configured site functions, subject to their own terms and privacy practices.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies and Browser Storage",
      body: [
        "Required storage supports authentication, Guest Cart continuity, pending sandbox Checkout, Referral Codes, Cookie Acknowledgement, and security. Stripe may use functional storage when its payment-method messaging loads on eligible Product pages. Optional analytics and advertising categories are not active.",
        "The footer links to the Cookie Policy status page and opens the Cookie notice. Acknowledging that notice does not create a Cookie Preference or enable optional storage.",
      ],
    },
    {
      id: "retention",
      title: "Retention",
      body: [
        "Supabase account and profile data remain until the account or profile is changed or removed through application or administrative processes.",
        "Guest cart tokens are configured for a 60-day cookie lifetime, and guest cart rows include an expiration timestamp.",
        "Order, payment-attempt, rewards-ledger, referral, and private-feedback records are retained as auditable sandbox transaction history unless removed through an administrative process.",
        "Provider log retention follows each provider's configured service. No customer-facing provider-log retention schedule has been published.",
      ],
    },
    {
      id: "choices",
      title: "Your Choices",
      body: [
        "Account holders can access and update profile names through the Account page and can request a password reset through the account forms.",
        "Users can remove cart items or clear the cart through the cart interface.",
        "Signed-in users can view their own sandbox order history, rewards ledger, referral code, and eligible private-feedback requests in Account and Rewards areas.",
        "The Cookie notice explains current required and functional storage. Your Privacy Choices explains the current state of sale, sharing, and targeted-advertising controls.",
      ],
    },
    {
      id: "state-privacy",
      title: "U.S. State Privacy Requests",
      body: [
        "The site does not currently include advertising pixels, cross-context behavioral advertising, sale/share technology, or targeted-advertising opt-out technology.",
        "A verified public Support Channel for Privacy Requests must exist before the site collects support messages or enables marketing email, optional analytics, advertising, or live Checkout.",
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
        "The current implementation uses technical and organizational safeguards appropriate to its available features. No website can guarantee absolute security.",
        "Do not send card numbers, passwords, health records, or other sensitive information through unofficial channels.",
      ],
    },
    {
      id: "changes",
      title: "Changes",
      body: [
        "This factual summary must be updated as features, providers, or legal requirements change. An operative Privacy Policy requires Legal Operator details and legal review before public release.",
      ],
    },
    {
      id: "contact",
      title: "Contact",
      body: [
        `Use the Contact page to review current Privacy Request preparation details. ${supportPolicy.contactStatus} The page cannot submit or store a Privacy Request.`,
      ],
    },
  ],
};
