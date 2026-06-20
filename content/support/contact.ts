export type ContactInquiryType = {
  value: string;
  label: string;
  description: string;
};

export const contactInquiryTypes: ContactInquiryType[] = [
  {
    value: "product",
    label: "Product question",
    description: "Product facts, availability, variants, or page content.",
  },
  {
    value: "routine",
    label: "Ingredient or routine question",
    description: "Method order, formula notes, or ingredient literacy.",
  },
  {
    value: "account",
    label: "Account support",
    description: "Sign-in, verification, password reset, or profile questions.",
  },
  {
    value: "cart",
    label: "Cart or technical issue",
    description: "Cart persistence, quick buy, search, or site behavior.",
  },
  {
    value: "accessibility",
    label: "Accessibility feedback",
    description: "Keyboard access, screen-reader feedback, focus, motion, or contrast.",
  },
  {
    value: "privacy",
    label: "Privacy request",
    description: "Access, correction, deletion, cookie, or privacy-choice questions.",
  },
  {
    value: "partnership",
    label: "Partnership or collaboration",
    description: "Brand, creative, affiliate, or collaboration inquiries.",
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

export const contactTransportStatus = {
  configured: false,
  heading: "MESSAGE TRANSPORT NOT CONFIGURED",
  message:
    "This development site validates the form locally but does not send or store contact messages yet.",
};

