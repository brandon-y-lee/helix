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
  status: "EMAIL UPDATES COMING SOON",
  note:
    "Newsletter storage and delivery are not configured yet, so this site does not collect email signups.",
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
      { label: "Cart", href: "/cart" },
      { label: "Routine Guidance", href: "/method#method-routine" },
    ],
  },
  {
    id: "official",
    label: "Official",
    links: [
      { label: "Privacy", href: "/privacy-policy" },
      { label: "Terms", href: "/terms-of-service" },
      { label: "Accessibility", href: "/accessibility" },
      { label: "Cookie Policy", href: "/cookie-policy" },
      { label: "Your Privacy Choices", href: "/privacy-choices" },
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

