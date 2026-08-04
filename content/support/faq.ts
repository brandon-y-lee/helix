import {
  formatFreeShippingThreshold,
  returnsPolicy,
  shippingPolicy,
  supportPolicy,
} from "@/content/support/policy";

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
    summary: "Product selection, ingredient facts, suitability, and routine fit.",
    items: [
      {
        id: "what-is-mei-pelle",
        question: "What is Mei Pelle?",
        answer:
          "Mei Pelle is a prestige men's skincare system built around concise product steps, ingredient literacy, and a disciplined daily routine.",
      },
      {
        id: "available-products",
        question: "What products are in the current system?",
        answer:
          "The current catalog centers on CLEANSE, REFINE, TREAT, FRAME, SEAL, and LIFT. PROTECT appears in the System as a sunscreen step that is not currently offered for purchase.",
        links: [{ label: "Shop the system", href: "/collections/shop" }],
      },
      {
        id: "choose-products",
        question: "Where should I start?",
        answer:
          "Start with the foundation: cleanse, treat, and moisturize. Add eye care, weekly treatment, and sunscreen steps only when they match your routine and tolerance. More steps are not automatically better.",
        links: [{ label: "View the System", href: "/system" }],
      },
      {
        id: "full-ingredients",
        question: "Where can I find full ingredients?",
        answer:
          "Product detail pages include ingredient and formulation sections when complete ingredient information is available. If a complete INCI list is not available, the page should say so plainly.",
      },
      {
        id: "skin-suitability",
        question: "Are products suitable for every skin type?",
        answer:
          "No single formula is universal. Review the product page, directions, and cautions, and patch test when introducing a new product. Stop use if irritation occurs.",
      },
      {
        id: "medical-advice",
        question: "Is Mei Pelle medical advice?",
        answer:
          "No. Product pages and ingredient notes are cosmetic and educational. They are not medical advice, diagnosis, or treatment, and they should not replace guidance from a qualified clinician.",
      },
    ],
  },
  {
    id: "accounts",
    label: "Accounts",
    summary: "Sign-in, verification, password reset, and cart merge behavior.",
    items: [
      {
        id: "create-account",
        question: "How do I create an account?",
        answer:
          "Use the Account page to sign up with email and password. Supabase handles authentication, session cookies, verification, and password reset links.",
        links: [{ label: "Account", href: "/account" }],
      },
      {
        id: "verify-email",
        question: "How do I verify my email?",
        answer:
          "After signup, follow the verification link sent by the authentication provider. Email delivery depends on the configured authentication project.",
      },
      {
        id: "reset-password",
        question: "How do I reset my password?",
        answer:
          "Use the forgot-password flow from the Account page. If an account exists, reset instructions are sent through the authentication provider.",
      },
      {
        id: "guest-cart",
        question: "What happens to my guest cart if I sign in?",
        answer:
          "Guest carts use a secure cart token. After sign-in, eligible guest cart lines merge into the authenticated cart so you can keep reviewing the same routine.",
      },
      {
        id: "profile-updates",
        question: "Can I update my profile?",
        answer:
          "Signed-in users can update optional first and last name fields from the Account dashboard.",
      },
    ],
  },
  {
    id: "orders",
    label: "Orders",
    summary: "Sandbox checkout, order confirmation, and account order history.",
    items: [
      {
        id: "checkout-availability",
        question: "Can I place an order right now?",
        answer:
          "You can complete Stripe-hosted Checkout in sandbox mode only. It can collect sandbox checkout details and create sandbox order records, but it does not create a real charge, shipment, fulfillment, customer email, or Trustpilot invitation.",
      },
      {
        id: "cart-purpose",
        question: "What is the cart for?",
        answer:
          "The cart lets you review products, variants, quantities, subtotals, estimated points, and eligible rewards before sandbox Checkout. Prices, discounts, availability, rewards, and shipping thresholds are revalidated on the server.",
        links: [{ label: "View cart", href: "/cart" }],
      },
      {
        id: "order-history",
        question: "Where is my order history?",
        answer:
          "Authenticated sandbox orders appear in the Account area. Guest sandbox orders can be viewed only through the immediate verified confirmation flow and do not earn rewards.",
      },
      {
        id: "edit-order",
        question: "Can I edit or cancel an order?",
        answer:
          "A canceled or expired Stripe Checkout Session preserves the cart and releases reserved points. Sandbox orders do not create fulfillment, so shipment edits and tracking are not available.",
      },
    ],
  },
  {
    id: "shipping",
    label: "Shipping",
    summary: "Planned standard shipping policy, threshold, timing, and limits.",
    items: [
      {
        id: "free-shipping",
        question: "Does Mei Pelle offer free standard shipping?",
        answer: `Standard shipping is planned to be free on eligible United States orders of ${formatFreeShippingThreshold()} before taxes and any discounts that change the merchandise subtotal.`,
      },
      {
        id: "shipping-destinations",
        question: "Where will Mei Pelle ship?",
        answer:
          shippingPolicy.destinationSummary +
          " International, expedited, freight forwarder, and resale shipping terms are not available unless Mei Pelle publishes them later.",
      },
      {
        id: "shipping-timing",
        question: "How long will shipping take?",
        answer: `The planned estimate is ${shippingPolicy.processingWindow} for processing, then ${shippingPolicy.transitWindow}. Carrier tracking can take ${shippingPolicy.trackingWindow} to update.`,
      },
      {
        id: "shipping-address-changes",
        question: "Can I change my shipping address after checkout?",
        answer:
          "Sandbox Checkout can collect a shipping address for testing, but no real shipment is created. Address-change support and tracking are launch dependencies outside the sandbox flow.",
      },
    ],
  },
  {
    id: "returns",
    label: "Returns & Refunds",
    summary: "Return windows, damaged items, exchanges, and refund timing.",
    items: [
      {
        id: "return-window",
        question: "What is the return window?",
        answer: `Mei Pelle's planned return window is ${returnsPolicy.returnWindowDays} days from delivery for eligible items. ${returnsPolicy.condition}`,
      },
      {
        id: "damaged-missing",
        question: "What if an item arrives damaged, missing, or incorrect?",
        answer: `Report the issue within ${returnsPolicy.issueReportWindowDays} days of delivery and keep packaging, order details, and clear photos. Approved claims may be resolved with a replacement, refund, or other remedy when order support exists.`,
      },
      {
        id: "refund-timing",
        question: "When will I receive a refund?",
        answer: `Approved refunds are planned to be processed within ${returnsPolicy.refundProcessingWindow}. Your bank or card issuer may take additional time to post the credit.`,
      },
      {
        id: "exchanges",
        question: "Do you offer exchanges?",
        answer:
          "Direct exchanges are not planned as a default flow. If a damaged, missing, or incorrect item claim is approved, Mei Pelle may offer a replacement when inventory and support operations allow.",
      },
      {
        id: "shipping-costs",
        question: "Are original shipping costs refundable?",
        answer:
          "Original shipping costs are not planned to be refundable unless Mei Pelle caused the issue or applicable law requires a different result.",
      },
    ],
  },
  {
    id: "rewards",
    label: "Rewards",
    summary: "Points, redemptions, referrals, private feedback, and refunds.",
    items: [
      {
        id: "rewards-program",
        question: "Does Mei Pelle have a rewards program?",
        answer:
          "MEI PELLE REWARDS is account-backed. Confirmed members receive 100 welcome points once, earn 2 points per eligible net merchandise dollar after successful sandbox payment, and can redeem 200, 400, or 600 points for $5, $10, or $15 off one eligible order.",
        links: [{ label: "Rewards", href: "/rewards" }],
      },
      {
        id: "promo-codes",
        question: "Can I stack rewards or promo codes?",
        answer:
          "No. Checkout applies at most one internal points reward or one referral offer. Stripe promotion-code entry is disabled so points, referrals, and free-shipping calculations stay server-authoritative.",
      },
      {
        id: "referrals",
        question: "How do referrals work?",
        answer:
          "A confirmed account can share a referral code. A referred friend must sign in with a confirmed account and can use 15% off a first qualifying order of $50+ before the referral discount. Self-referrals and stacking are blocked.",
      },
      {
        id: "private-feedback-reward",
        question: "Does private feedback earn points?",
        answer:
          "Eligible paid sandbox orders can unlock one private first-party feedback request worth 300 points. The reward is the same for positive, neutral, or negative sentiment. This is not a Trustpilot review and is not published publicly.",
      },
      {
        id: "trustpilot-rewards",
        question: "Do Trustpilot reviews earn points?",
        answer:
          "No. Trustpilot invitations are independent from rewards. Mei Pelle does not award points for writing, editing, or deleting a Trustpilot review, and sandbox orders do not send real Trustpilot invitations.",
      },
    ],
  },
  {
    id: "contact",
    label: "Contact",
    summary: "Support routing and the current intake limitation.",
    items: [
      {
        id: "contact-topics",
        question: "What can I contact Mei Pelle about?",
        answer:
          "The Contact page organizes product, System, account, cart, accessibility, privacy, partnership, wholesale, and general inquiry topics so the right information is ready when public support intake opens.",
        links: [{ label: "Contact", href: "/contact" }],
      },
      {
        id: "contact-intake",
        question: "Can I send Mei Pelle a message through the site?",
        answer:
          supportPolicy.contactStatus +
          " The Contact page does not submit or store messages until a verified intake channel is published.",
      },
      {
        id: "private-details",
        question: "What should I avoid sending?",
        answer:
          "Do not send card numbers, passwords, government IDs, health records, or other sensitive information through unofficial channels.",
      },
    ],
  },
  {
    id: "policies",
    label: "Policies",
    summary: "Privacy, terms, accessibility, cookies, and privacy choices.",
    items: [
      {
        id: "privacy",
        question: "Where is the Privacy Policy?",
        answer:
          "The Privacy Policy explains account, cart, search, cookie, support-intake, and provider data practices for the current site.",
        links: [{ label: "Privacy Policy", href: "/privacy" }],
      },
      {
        id: "terms",
        question: "Where are the Terms of Service?",
        answer:
          "The Terms explain site use, accounts, product information, cart status, acceptable use, intellectual property, and service limits.",
        links: [{ label: "Terms of Service", href: "/terms" }],
      },
      {
        id: "accessibility",
        question: "Where is the Accessibility Statement?",
        answer:
          "The Accessibility Statement explains Mei Pelle's WCAG target, implemented practices, testing approach, and feedback path.",
        links: [{ label: "Accessibility Statement", href: "/accessibility" }],
      },
      {
        id: "cookies",
        question: "Where can I manage cookie preferences?",
        answer:
          "Cookie Preferences explains the current essential-cookie setup and inactive optional categories. Your Privacy Choices explains the current state of sale, sharing, and targeted advertising controls.",
        links: [
          { label: "Cookie Policy", href: "/cookie-policy" },
          { label: "Your Privacy Choices", href: "/privacy-choices" },
        ],
      },
    ],
  },
];
