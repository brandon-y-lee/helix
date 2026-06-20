export type FAQItem = {
  id: string;
  question: string;
  answer: string;
  links?: Array<{ label: string; href: string }>;
};

export type FAQCategory = {
  id: string;
  label: string;
  summary: string;
  items: FAQItem[];
};

export const faqCategories: FAQCategory[] = [
  {
    id: "products",
    label: "Products",
    summary: "What is available, where ingredient facts live, and how to choose.",
    items: [
      {
        id: "what-is-mei-pelle",
        question: "What is Mei-Pelle?",
        answer:
          "Mei-Pelle is a development storefront for an original prestige men's skincare system built around concise product steps and routine discipline.",
      },
      {
        id: "available-products",
        question: "What products are currently available?",
        answer:
          "The current catalog centers on RESET, REFINE, RECODE, FRAME, SEAL, and LIFT. PROTECT is shown on the Method page as a coming-soon sunscreen step, not as purchasable merchandise.",
        links: [{ label: "Shop the system", href: "/products" }],
      },
      {
        id: "full-ingredients",
        question: "Where can I find full ingredients?",
        answer:
          "Product detail pages include ingredient and formulation sections when the catalog has complete ingredient information. If a complete INCI list is unavailable, the page should say so honestly.",
      },
      {
        id: "suitability",
        question: "Are products suitable for every skin type?",
        answer:
          "No product should be treated as universal. Review the product page, directions, and cautions, and patch test when introducing a new formula.",
      },
    ],
  },
  {
    id: "method",
    label: "Method",
    summary: "Order, timing, and frequency for the current system.",
    items: [
      {
        id: "routine-order",
        question: "What order should products be used in?",
        answer:
          "Use the Method sequence: RESET, REFINE, RECODE, FRAME, SEAL, PROTECT in the morning, and LIFT as a weekly intensive.",
        links: [{ label: "View the Method", href: "/method" }],
      },
      {
        id: "am-routine",
        question: "What is the AM routine?",
        answer:
          "Morning routine: cleanse, treat, eye, moisturize, and finish with broad-spectrum SPF. Mei-Pelle's PROTECT step is coming soon.",
      },
      {
        id: "pm-routine",
        question: "What is the PM routine?",
        answer:
          "Night routine: cleanse, treat, eye, and moisturize. Use frequency-dependent steps exactly as the product page directs.",
      },
      {
        id: "refine-lift-frequency",
        question: "How often should REFINE or LIFT be used?",
        answer:
          "Follow the current product directions. REFINE is a treatment step with frequency restraint; LIFT is positioned as a weekly intensive.",
      },
    ],
  },
  {
    id: "ingredients",
    label: "Ingredients",
    summary: "Plain-language ingredient education without medical claims.",
    items: [
      {
        id: "pdrn",
        question: "What is PDRN?",
        answer:
          "In the current Method content, PDRN is described as Sodium DNA used in topical cosmetics as a conditioning ingredient. The site does not claim DNA repair, wound healing, or medical regeneration.",
      },
      {
        id: "peptides",
        question: "What are peptides?",
        answer:
          "Peptides are short amino-acid sequences. Their cosmetic role depends on the exact sequence, stability, concentration, and formula context.",
      },
      {
        id: "niacinamide",
        question: "Why use niacinamide?",
        answer:
          "Niacinamide is a vitamin B3 derivative used in cosmetics for broad conditioning, barrier-feel, tone, and oil-balance appearance support.",
      },
      {
        id: "barrier-support",
        question: "What does barrier support mean?",
        answer:
          "Mei-Pelle uses barrier support as cosmetic comfort and conditioning language. It is not an eczema, wound-healing, or medical-treatment claim.",
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    summary: "Sign-up, verification, reset links, and profile tools.",
    items: [
      {
        id: "create-account",
        question: "How do I create an account?",
        answer:
          "Use the Account page to sign up with email and password. Supabase handles authentication and email verification.",
        links: [{ label: "Account", href: "/account" }],
      },
      {
        id: "verify-email",
        question: "How do I verify my email?",
        answer:
          "After signup, follow the verification link sent by the authentication provider. Local email delivery depends on the configured development Supabase project.",
      },
      {
        id: "reset-password",
        question: "How do I reset my password?",
        answer:
          "Use the forgot-password flow from the Account page. If an account exists, reset instructions are sent through Supabase.",
      },
      {
        id: "update-profile",
        question: "How do I update my profile?",
        answer:
          "Signed-in users can update optional first and last name fields from the Account dashboard.",
      },
    ],
  },
  {
    id: "cart",
    label: "Cart and Availability",
    summary: "Cart persistence, variants, unavailable items, and checkout status.",
    items: [
      {
        id: "cart-persistence",
        question: "Does the cart persist?",
        answer:
          "Yes. Guest carts use a secure HttpOnly cart token and authenticated carts persist through Supabase. Guest carts merge after sign-in.",
      },
      {
        id: "variants",
        question: "How are variants handled?",
        answer:
          "Cart lines are variant-specific. Prices and availability are validated against canonical catalog data on the server.",
      },
      {
        id: "unavailable",
        question: "What happens when an item becomes unavailable?",
        answer:
          "Unavailable or archived cart lines remain removable and should not crash the cart.",
      },
      {
        id: "checkout",
        question: "Is checkout currently available?",
        answer:
          "No. Checkout is a development placeholder. Real payments, shipping, tax, fulfillment, and orders are not implemented.",
      },
    ],
  },
  {
    id: "contact",
    label: "Contact",
    summary: "How to route questions without collecting unsupported data.",
    items: [
      {
        id: "contact-topics",
        question: "What can I contact Mei-Pelle about?",
        answer:
          "The Contact page includes product questions, ingredient or routine questions, account support, cart or technical issues, accessibility feedback, privacy requests, partnerships, wholesale, and general inquiries.",
        links: [{ label: "Contact", href: "/contact" }],
      },
      {
        id: "contact-transport",
        question: "Will the Contact page send my message?",
        answer:
          "Not yet. The development site validates the fields but does not transmit or store contact messages until a support transport is configured.",
      },
    ],
  },
];

