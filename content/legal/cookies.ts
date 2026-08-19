import type { LegalDocument } from "./types";
import {
  COOKIE_ACKNOWLEDGEMENT_COOKIE,
  GUEST_CART_COOKIE,
  PENDING_CHECKOUT_COOKIE,
  REFERRAL_COOKIE,
} from "@/lib/customer-state-identifiers";

export type CookieCategory = {
  category: string;
  active: boolean;
  examples: string[];
  purpose: string;
  optional: boolean;
};

export const cookieCategories: CookieCategory[] = [
  {
    category: "Essential",
    active: true,
    examples: [
      "Supabase authentication cookies",
      GUEST_CART_COOKIE,
      PENDING_CHECKOUT_COOKIE,
      REFERRAL_COOKIE,
      COOKIE_ACKNOWLEDGEMENT_COOKIE,
    ],
    purpose:
      "Keep Customers signed in, preserve Cart and referral state, track a pending sandbox Checkout, and remember the required-storage acknowledgement.",
    optional: false,
  },
  {
    category: "Functional",
    active: true,
    examples: ["Stripe Payment Method Messaging Element storage on eligible product pages"],
    purpose:
      "Let Stripe determine eligibility and render current payment-method information without the application deriving or presenting its own installment terms.",
    optional: false,
  },
  {
    category: "Analytics",
    active: false,
    examples: ["No analytics provider is implemented in the repository."],
    purpose: "Not currently active.",
    optional: true,
  },
  {
    category: "Advertising",
    active: false,
    examples: ["No advertising pixel or cross-context behavioral advertising tag is implemented."],
    purpose: "Not currently active.",
    optional: true,
  },
];

export const cookiePolicy: LegalDocument = {
  title: "Cookie Policy",
  metadataTitle: "Cookie Policy | helix",
  description:
    "Current cookie and browser-storage behavior on the helix Public Site.",
  canonical: "/cookie-policy",
  status: "Updated August 19, 2026",
  intro:
    "This factual prelaunch summary documents the Cookie Categories currently reflected in application code. It is not an operative Cookie Policy, and optional analytics and advertising cookies are not implemented.",
  sections: [
    {
      id: "what-cookies-do",
      title: "What Cookies Do",
      body: [
        "Cookies and similar browser storage can keep a user signed in, preserve a guest cart, remember simple preferences, or support security and routing.",
      ],
    },
    {
      id: "current-categories",
      title: "Current Categories",
      body: [
        "The current site uses required storage for Supabase authentication, server-backed guest Carts, pending sandbox Checkout, Referral Codes, and Cookie Acknowledgement. Stripe may use functional cookies or similar storage when its payment-method messaging loads on eligible Product pages. No optional analytics or advertising categories are active.",
      ],
    },
    {
      id: "search-and-fonts",
      title: "Search and Fonts",
      body: [
        "Product search sends search terms to Algolia when the search UI is used. Google Fonts may receive technical requests needed to deliver the configured fonts.",
      ],
    },
    {
      id: "acknowledgement",
      title: "Cookie Acknowledgement",
      body: [
        "The Cookie notice records that a Visitor was shown the current required and functional storage disclosure. It does not record agreement to optional storage and does not imply that optional toggles are available.",
      ],
    },
    {
      id: "future",
      title: "Future Changes",
      body: [
        "If analytics, advertising, region choices, or other optional storage are added, this page and a genuine Cookie Preference control must be updated before those tools load.",
      ],
    },
  ],
};
