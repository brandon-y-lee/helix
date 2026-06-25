export type FooterLink = {
  label: string;
  href: string;
  description?: string;
};

export type FooterLinkGroup = {
  id: string;
  label: string;
  links: FooterLink[];
};

export const footerBrandStatement =
  "Prestige skincare for men built around discipline, consistency, and a cleaner routine.";

export const footerUpdateModule = {
  eyebrow: "Updates",
  heading: "STAY IN THE SYSTEM.",
  summary: "Product releases, formula notes, and method updates.",
  status: "EMAIL UPDATES ARE NOT OPEN",
  note: "Mei-Pelle is not collecting newsletter email addresses right now.",
};

export const footerLinkGroups: FooterLinkGroup[] = [
  {
    id: "navigate",
    label: "Navigate",
    links: [
      { label: "Shop", href: "/products" },
      { label: "Method", href: "/method" },
      { label: "About", href: "/about" },
      { label: "Account", href: "/account" },
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

export const footerOmittedRoutes = [
  "Store locator",
  "Events",
  "Impact",
  "Careers",
  "Press",
  "Payment methods",
  "Social profiles",
];
