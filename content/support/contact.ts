import { supportPolicy } from "@/content/support/policy";

export type ContactInquiryType = {
  value: string;
  label: string;
  description: string;
};

export type ContactPreparationGroup = {
  title: string;
  items: string[];
};

export const contactInquiryTypes: ContactInquiryType[] = [
  {
    value: "product",
    label: "Product question",
    description: "Product facts, availability, variants, ingredients, or page content.",
  },
  {
    value: "routine",
    label: "Ingredient or routine question",
    description: "Method order, formula notes, skin goals, or ingredient literacy.",
  },
  {
    value: "account",
    label: "Account support",
    description: "Sign-in, verification, password reset, profile, or cart merge questions.",
  },
  {
    value: "cart",
    label: "Cart or technical issue",
    description: "Cart persistence, quick buy, product search, or site behavior.",
  },
  {
    value: "accessibility",
    label: "Accessibility feedback",
    description: "Keyboard access, screen-reader behavior, focus, motion, or contrast.",
  },
  {
    value: "privacy",
    label: "Privacy request",
    description: "Access, correction, deletion, cookie, or privacy-choice questions.",
  },
  {
    value: "partnership",
    label: "Partnership or collaboration",
    description: "Brand, creative, affiliate, editorial, or collaboration inquiries.",
  },
  {
    value: "wholesale",
    label: "Wholesale",
    description: "Retail or wholesale interest. No retail program is active yet.",
  },
  {
    value: "general",
    label: "General inquiry",
    description: "A question that does not fit another category.",
  },
];

export const contactPreparationGroups: ContactPreparationGroup[] = [
  {
    title: "Helpful details",
    items: [
      "The inquiry type that best matches your question.",
      "The product or routine step involved, if relevant.",
      "Your browser, device, and a short description for technical issues.",
      "For accessibility feedback, the page, assistive technology, and action you were trying to complete.",
    ],
  },
  {
    title: "Do not include",
    items: [
      "Payment card numbers, passwords, or one-time codes.",
      "Government IDs, health records, or sensitive medical details.",
      "Information about someone else unless you are authorized to share it.",
    ],
  },
];

export const contactIntakeStatus = {
  configured: supportPolicy.contactIntakeConfigured,
  heading: "PUBLIC SUPPORT INTAKE PENDING",
  message:
    "Mei Pelle has not published a verified public support destination yet. This page explains how inquiries will be routed once intake is available.",
};
