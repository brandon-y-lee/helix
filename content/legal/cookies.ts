import { CONSENT_KEY } from "@/lib/privacy/consent";
import { measurementConfig } from "@/lib/privacy/measurement-config";
import type { LegalDocument } from "./types";
import {
  CART_IDENTITY_CHANGED_COOKIE,
  CHECKOUT_RECEIPT_COOKIE,
  COOKIE_ACKNOWLEDGEMENT_COOKIE,
  GUEST_CART_COOKIE,
  PENDING_CHECKOUT_COOKIE,
  REFERRAL_COOKIE,
} from "@/lib/customer-state-identifiers";

export const requiredCookies = [
  {
    name: "sb-…-auth-token and sb-…-auth-token-code-verifier (including numbered parts)",
    purpose:
      "Keeps you signed in and supports secure account access and password recovery.",
    duration:
      "Up to 400 days in browser storage; session validity is managed separately. Authentication cookies may be refreshed or removed as part of account access or sign-out.",
  },
  {
    name: GUEST_CART_COOKIE,
    purpose: "Connects your browser to your guest shopping cart.",
    duration: "60 days from when the cookie is set.",
  },
  {
    name: PENDING_CHECKOUT_COOKIE,
    purpose: "Helps recover a pending checkout from your cart.",
    duration: "30 minutes; removed when no longer needed.",
  },
  {
    name: CHECKOUT_RECEIPT_COOKIE,
    purpose: "Provides private access to guest order receipts.",
    duration:
      "Up to 24 hours, with expiry set by the server. Viewing a receipt does not extend access.",
  },
  {
    name: REFERRAL_COOKIE,
    purpose: "Remembers a valid referral code you followed.",
    duration: "30 days from when a valid referral link sets the cookie.",
  },
  {
    name: CART_IDENTITY_CHANGED_COOKIE,
    purpose: "Updates your cart after an account change.",
    duration: "Up to 5 minutes; removed when the cart update signal is read.",
  },
  {
    name: COOKIE_ACKNOWLEDGEMENT_COOKIE,
    purpose:
      "A previous version of our cookie notice used this cookie to remember that you acknowledged the notice. The current privacy dialog does not set it.",
    duration:
      "If previously saved, up to 365 days from acknowledgement or until you delete it.",
  },
];

export const cookieCategories = [
  {
    category: "Essential",
    active: true,
    optional: false,
    examples: requiredCookies.map(({ name }) => name),
    purpose: "Support account access, shopping, security and related services.",
  },
  {
    category: "Analytics",
    active:
      measurementConfig.gaEnabled ||
      measurementConfig.webAnalytics ||
      measurementConfig.speedInsights,
    optional: true,
    examples: [],
    purpose:
      "Google Analytics and Vercel usage/performance services require your analytics permission.",
  },
  {
    category: "Advertising",
    active: measurementConfig.metaEnabled,
    optional: true,
    examples: [],
    purpose: "Meta advertising technology requires your marketing permission.",
  },
];

export const cookiePolicy: LegalDocument = {
  title: "Cookie Policy",
  metadataTitle: "Cookie Policy | helix",
  description:
    "Learn how Helix uses cookies, how long they remain and how to manage them.",
  canonical: "/cookie-policy",
  status: "Last updated October 28, 2026",
  intro:
    'This Cookie Policy explains how Helix Labs LLC DBA Helix ("Helix", "we", "us" or "our") uses cookies and similar technologies on our website, and the choices available to you.',
  sections: [
    {
      id: "what-cookies-do",
      title: "What are cookies?",
      body: [
        "Cookies are small text files stored by your browser when you visit a website. They allow a website to remember information between visits or requests, such as the shopping cart associated with your browser or whether you are signed in.",
        "Some cookies last only for a browsing session. Others remain until their expiry date or until you delete them. First-party cookies are set for the website you are visiting; third-party cookies may be set by services on a different domain.",
      ],
    },
    {
      id: "how-we-use-cookies",
      title: "How we use cookies",
      body: [
        "We use required cookies for account authentication, security, guest shopping carts, checkout recovery, referral codes and private access to guest order receipts. These cookies support the features you request and cannot be switched off through our privacy dialog.",
        "Optional analytics and marketing technologies run only when enabled on this website and you allow the relevant category in Your Privacy Choices. Analytics covers Google Analytics, Vercel Web Analytics and Vercel Speed Insights. Marketing covers the Meta Pixel. Product-page payment-method messaging is not active.",
      ],
    },
    {
      id: "required-cookies",
      title: "Cookies used on our website",
      body: [
        "The table below describes the cookies used by our website and their browser-storage lifetimes. A cookie may be removed earlier when you sign out, complete a related action or clear your browser data. Cookie lifetimes do not determine how long we retain account or order information.",
      ],
    },
    {
      id: "optional-storage",
      title: "Browser storage and optional technologies",
      body: [
        "We use local browser storage to remember your privacy choices for 180 days. Required cookies remain active. Google Analytics and Meta may also set cookies when the relevant optional category is enabled and you permit it. Vercel Web Analytics and Speed Insights do not use analytics cookies, but they still collect usage or performance information and are covered by the analytics choice.",
        "Our measurement is limited to public-page visits and website performance. These integrations do not receive your account details, email address, search terms, order details or purchase history from our application. We exclude private account, authentication and checkout pages from these integrations.",
      ],
    },
    {
      id: "other-services",
      title: "Search and other services",
      body: [
        "When you use product search, your search terms are sent to Algolia to return matching products. Our product search does not include an optional cookie control in the privacy dialog.",
        "If you proceed to Stripe-hosted Checkout, Stripe may use its own cookies and similar technologies on its service. Those technologies are governed by Stripe's policies and browser controls; the table above describes cookies set by our website.",
      ],
    },
    {
      id: "your-choices",
      title: "How to manage cookies",
      body: [
        "You can open Your Privacy Choices from the footer at any time to allow or turn off optional analytics and marketing. Confirm my choices saves your selection in this browser; Accept All permits both optional categories, except marketing remains off while Global Privacy Control is on. Closing without confirming discards changes. Your choices are not linked to your account and do not apply to other browsers or devices.",
        "Your browser settings let you view, block or delete cookies. The steps vary by browser; consult its Help or Privacy settings. Blocking required cookies may prevent you from signing in, keeping items in your cart or accessing a private guest receipt. Deleting a cookie does not delete related account or order information held by us.",
        "We apply Global Privacy Control (GPC) to turn off marketing in the browser sending the signal, including when marketing was previously allowed. You can withdraw other optional permissions here at any time. Withdrawal stops future optional collection and may reload the page to apply your choices; it does not delete information already sent to a provider. Contact us for other privacy requests.",
      ],
    },
    {
      id: "changes",
      title: "Updates to this policy",
      body: [
        "We may update this policy as our website or use of cookies changes. The date above identifies the latest revision.",
      ],
    },
    {
      id: "contact",
      title: "Contact us",
      body: [
        "For questions about cookies or your personal information, contact Helix Labs LLC DBA Helix at support@helixskin.com. Our Privacy Policy explains more about how we handle personal information and your privacy rights.",
      ],
    },
  ],
};

export const browserStorage = [
  {
    name: CONSENT_KEY,
    purpose:
      "Remembers your analytics and marketing choices in local storage, with a version and save date. No account identifier is stored.",
    duration:
      "180 days from saving, then optional services stay off until you choose again.",
  },
  {
    name: "helix_privacy_focus",
    purpose:
      "Temporarily remembers the dialog's initiating control so focus can return after applying privacy changes.",
    duration: "Until used or the browser tab session ends.",
  },
  {
    name: "Google Analytics (_ga and property-specific cookies)",
    purpose:
      "Measures public-page visits when analytics is enabled and you allow it.",
    duration:
      "Configured for up to 180 days after a cookie update; browser settings can remove them sooner.",
  },
  {
    name: "Meta Pixel cookies and advertising identifiers",
    purpose:
      "Advertising measurement on public pages when marketing is enabled and you allow it.",
    duration:
      "Set by Meta and subject to browser controls. Your browser shows any cookie's actual expiry.",
  },
];
