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

export const footerUpdateModule = {
  eyebrow: "Updates",
  heading: "Stay in the system.",
  summary: "Product releases, formula notes, and system updates.",
  status: "Email updates are not open",
  note: "Mei Pelle is not collecting newsletter email addresses right now.",
};

export const footerLinkGroups: FooterLinkGroup[] = [
  {
    id: "navigate",
    label: "Navigate",
    links: [
      { label: "Shop", href: "/collections/shop" },
      { label: "System", href: "/system" },
      { label: "About", href: "/about" },
      { label: "Account", href: "/account" },
      { label: "Rewards", href: "/rewards" },
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
];
