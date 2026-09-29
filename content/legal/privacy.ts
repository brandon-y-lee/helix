import type { LegalDocument } from "./types";
import { supportPolicy } from "@/content/support/policy";

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  metadataTitle: "Privacy Policy | helix",
  description:
    "Current account, Cart, search, sandbox Checkout, rewards, referral, private-feedback, browser-storage, and provider data practices on the helix Platform.",
  canonical: "/privacy",
  status: "Updated September 29, 2026",
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
        `${supportPolicy.contactStatus} When enabled, the form stores your name, email address, Inquiry Type, subject, and message privately for support. An optional Order association requires verified access to that Order. Only a confirmed acceptance means your Inquiry was received.`,
        "When enabled, support also accepts email replies and up to five JPEG, PNG, or WebP photos per message. Photos are stored privately, checked for supported content, and processed to remove unnecessary metadata.",
        "When marketing signup is enabled, it records your email address, explicit permission, confirmation and withdrawal choices. Product availability requests are separate from marketing subscriptions; requesting one Product's notice does not subscribe you to general marketing.",
      ],
    },
    {
      id: "automatic-information",
      title: "Information Collected Automatically",
      body: [
        "Supabase authentication uses cookies to maintain sessions.",
        "Guest Carts use a high-entropy HttpOnly cookie named helix_guest_cart. The server stores only a hashed version of the guest token with Cart records.",
        "Guest receipt access uses a separate HttpOnly cookie named helix_checkout_receipt containing a random 32-byte token. The server stores only the token hash and access grants for specific guest Orders. Clearing or merging a Cart does not immediately remove those receipt grants.",
        "Product search sends the search term to the configured Algolia index from the browser and receives storefront product records in response.",
        "Product-page payment-method messaging is currently disabled while sandbox Checkout supports cards only.",
        "Vercel, Next.js, Supabase, Algolia, and Google Fonts may process technical request data needed to host, secure, operate, and display the site.",
        "Support Intake uses keyed digests of request-source addresses and email addresses to limit abuse. These are used for request limits, not advertising.",
      ],
    },
    {
      id: "use",
      title: "How Information Is Used",
      body: [
        "Information is used to operate account access, password reset, profile updates, product discovery, cart persistence, sandbox Checkout, order history, rewards, referrals, private feedback, security checks, and site reliability.",
        "When Support Intake is enabled, authorized support Operators review private inquiries, keep internal notes, and approve replies. Email acknowledgement and reply delivery may be unavailable during development testing or a provider outage.",
        "When internal draft assistance is enabled and requested by the owner, selected conversation text and approved support information can be processed by OpenAI to suggest a reply. Photos are excluded from this input. A human must review and approve every reply before it can be sent.",
        "Sandbox Checkout is used for payment simulation only. When development email is enabled, demo Order confirmations and simulated Tracking notices may be sent to approved test recipients. Sandbox Orders do not ship Products, purchase labels, send real Trustpilot invitations, personalize advertising, or process live payments.",
      ],
    },
    {
      id: "providers",
      title: "Service Providers",
      body: [
        "Current providers reflected in the codebase include Supabase for authentication, profile, catalog, cart, order, reward, referral, private-feedback, support and subscription data; Stripe for sandbox Checkout and payment status; Resend for enabled email delivery, receiving and marketing preferences; OpenAI for enabled internal reply drafting; Algolia for product search; Vercel and Next.js for hosting and application delivery; and Google Fonts for web font delivery.",
        "Trustpilot invitations are not implemented in the current codebase. Sandbox orders do not send real Trustpilot invitations, and reward points are never conditioned on Trustpilot activity.",
        "Providers process information needed to deliver their configured site functions, subject to their own terms and privacy practices.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies and Browser Storage",
      body: [
        "Required storage supports authentication, Guest Cart continuity, pending sandbox Checkout, private guest receipts, Referral Codes, Cookie Acknowledgement, and security. Product-page payment-method messaging is currently disabled. Optional analytics and advertising categories are not active.",
        "The footer links to the Cookie Policy status page and opens the Cookie notice. Acknowledging that notice does not create a Cookie Preference or enable optional storage.",
      ],
    },
    {
      id: "retention",
      title: "Retention",
      body: [
        "Supabase account and profile data remain until the account or profile is changed or removed through application or administrative processes.",
        "Guest cart tokens are configured for a 60-day cookie lifetime, and guest cart rows include an expiration timestamp.",
        "Guest receipt capabilities last no more than 24 hours from issuance, and each Order's receipt access has a fixed maximum window. Later checkouts can reuse an unexpired capability; viewing a receipt never extends its deadline. Expiry removes browser receipt access without deleting the underlying Order history.",
        "Order, payment-attempt, rewards-ledger, referral, and private-feedback records are retained as auditable sandbox transaction history unless removed through an administrative process.",
        "Support cleanup is configured for Inquiry text twelve months after closure, photos ninety days after receipt, unsent drafts thirty days after creation, and minimal operational audit twelve months after creation. Reopening resets the Inquiry closure clock, but not photo age. Explicitly marked support and email test copies use a thirty-day cleanup period. Necessary safety or legal holds have a recorded reason and expiry; unresolved delivery may require reconciliation before cleanup.",
        "Cleanup removes private content and derived copies while keeping minimal records needed to prevent duplicate sends or uploads. It does not delete unrelated Order or accounting history. Provider-held copies follow each provider's terms and account settings. Resend publishes a thirty-day email and log retention period for its Free, Pro and Scale plans, separate from Helix's cleanup of support text and photos.",
      ],
    },
    {
      id: "choices",
      title: "Your Choices",
      body: [
        "Account holders can access and update profile names through the Account page and can request a password reset through the account forms.",
        "Users can remove cart items or clear the cart through the cart interface.",
        "Signed-in users can view their own sandbox order history, rewards ledger, referral code, and eligible private-feedback requests in Account and Rewards areas.",
        "When email services are enabled, marketing links let you withdraw from the welcome series or all marketing. Product notification links let you cancel the corresponding Product request separately. These choices do not stop necessary account, Order or support messages.",
        "The Cookie notice explains current required and functional storage. Your Privacy Choices explains the current state of sale, sharing, and targeted-advertising controls.",
      ],
    },
    {
      id: "state-privacy",
      title: "U.S. State Privacy Requests",
      body: [
        "The site does not currently include advertising pixels, cross-context behavioral advertising, sale/share technology, or targeted-advertising opt-out technology.",
        supportPolicy.privacyRequestRoute,
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
        supportPolicy.privacyRequestRoute,
      ],
    },
  ],
};
