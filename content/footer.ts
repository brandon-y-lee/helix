type FooterLink = {
  label: string;
  href?: string;
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
      { label: "Shipping Policy", href: "/faq#shipping" },
      { label: "Returns & Refunds", href: "/faq#returns" },
    ],
  },
  {
    id: "legal",
    label: "Official",
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
      { label: "Sign in", href: "/account/sign-in" },
      { label: "Create account", href: "/account/sign-up" },
      { label: "Rewards", href: "/rewards" },
      { label: "Subscription" },
    ],
  },
];

export const footerServiceCards: FooterServiceCard[] = [
  {
    id: "contact",
    label: "Contact Us",
    href: "/contact",
    icon: "contact",
  },
  {
    id: "shipping",
    label: "Shipping & returns",
    href: "/faq",
    icon: "shipping",
  },
  {
    id: "faq",
    label: "FAQ",
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
    linkLabel: "Payment options and availability",
    href: "/checkout",
  },
  locale: "EN · USD display only",
};
