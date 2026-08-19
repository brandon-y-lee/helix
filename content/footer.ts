type FooterLink = {
  label: string;
  href: string;
  description?: string;
};

export type FooterLinkGroup = {
  id: string;
  label: string;
  links: FooterLink[];
};

export type FooterServiceCard = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: "contact" | "shipping" | "faq";
};

export const footerLinkGroups: FooterLinkGroup[] = [
  {
    id: "navigate",
    label: "Navigate",
    links: [
      { label: "Shop", href: "/collections/shop" },
      { label: "System", href: "/system" },
      { label: "About", href: "/about" },
    ],
  },
  {
    id: "support",
    label: "Support",
    links: [
      { label: "FAQ", href: "/faq" },
      { label: "Contact", href: "/contact" },
      { label: "Shipping", href: "/faq#shipping" },
      { label: "Returns & Refunds", href: "/faq#returns" },
    ],
  },
  {
    id: "legal",
    label: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Accessibility", href: "/accessibility" },
    ],
  },
  {
    id: "account",
    label: "Account",
    links: [
      { label: "Account overview", href: "/account" },
      { label: "Sign in", href: "/account/sign-in" },
      { label: "Create account", href: "/account/sign-up" },
      { label: "helix rewards", href: "/rewards" },
    ],
  },
];

export const footerServiceCards: FooterServiceCard[] = [
  {
    id: "contact",
    label: "Contact status",
    description: "Support Intake unavailable",
    href: "/contact",
    icon: "contact",
  },
  {
    id: "shipping",
    label: "Shipping & returns",
    description: "Review current policy status",
    href: "/faq",
    icon: "shipping",
  },
  {
    id: "faq",
    label: "FAQ",
    description: "Product, account, and order guidance",
    href: "/faq",
    icon: "faq",
  },
];

export const footerStatusModules = {
  reviews: {
    label: "Customer reviews",
    status: "Not available",
    note: "No public rating is published.",
  },
  social: {
    label: "Social channels",
    status: "Not published",
    channels: [
      { label: "Instagram", mark: "IG" },
      { label: "Facebook", mark: "FB" },
      { label: "TikTok", mark: "TT" },
      { label: "Pinterest", mark: "PI" },
    ],
  },
  checkout: {
    label: "Checkout methods",
    status: "Stripe sandbox only — no live payments",
    methods: ["Card", "Wallet", "Bank"],
  },
  locale: "EN · USD display only",
};
