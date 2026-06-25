import type { LegalDocument } from "./types";

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
      "mei_pelle_guest_cart",
      "mei_pelle_cookie_preferences",
    ],
    purpose:
      "Keep users signed in, preserve cart identity, merge carts after sign-in, and remember the essential-cookie acknowledgement.",
    optional: false,
  },
  {
    category: "Functional",
    active: false,
    examples: ["No separate locale, region, or personalization preference storage is implemented."],
    purpose: "Not currently active.",
    optional: true,
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
  metadataTitle: "Cookie Policy | Mei-Pelle",
  description:
    "Current cookie and browser-storage behavior for the Mei-Pelle website.",
  canonical: "/cookie-policy",
  status: "Last updated June 24, 2026",
  intro:
    "This policy documents the cookie categories currently reflected in the application code. Optional analytics and advertising cookies are not implemented.",
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
        "The current site uses essential cookies for Supabase authentication, server-backed guest carts, and cookie-preference acknowledgement. No optional analytics or advertising categories are active.",
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
      id: "preferences",
      title: "Cookie Preferences",
      body: [
        "Because only essential categories are active, Cookie Preferences offers an essential-only acknowledgement rather than inactive analytics or advertising toggles.",
      ],
    },
    {
      id: "future",
      title: "Future Changes",
      body: [
        "If analytics, advertising, region preferences, or other optional storage are added, this policy and the Cookie Preferences control should be updated before those tools load.",
      ],
    },
  ],
};
