import {
  formatFreeShippingThreshold,
  returnsPolicy,
  shippingPolicy,
  supportPolicy,
} from "@/content/support/policy";

type FAQItem = {
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
        id: "what-is-helix",
        question: "What is helix?",
        answer:
          "Helix is a prestige men's skincare brand built around concise Product steps, ingredient literacy, and a disciplined daily Routine.",
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
        question: "Is helix medical advice?",
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
    summary: "Unavailable shipping capability and current planning assumptions.",
    items: [
      {
        id: "free-shipping",
        question: "Is standard shipping available?",
        answer: `No real shipping or Fulfillment capability is available. The current planning assumption is free standard shipping on eligible United States Orders of ${formatFreeShippingThreshold()} before taxes and any discounts that change the merchandise subtotal.`,
      },
      {
        id: "shipping-destinations",
        question: "Which destinations are being considered?",
        answer:
          "No Shipment service is available. " +
          shippingPolicy.destinationSummary +
          " International, expedited, freight-forwarder, and resale shipping are not current or committed capabilities.",
      },
      {
        id: "shipping-timing",
        question: "Are processing and transit estimates in effect?",
        answer: `No. These planning assumptions are not a Service Status commitment: ${shippingPolicy.processingWindow} for processing, ${shippingPolicy.transitWindow} for transit, and ${shippingPolicy.trackingWindow} before Tracking may update.`,
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
    summary: "Unavailable Return, Item Claim, Exchange, and refund capabilities.",
    items: [
      {
        id: "return-window",
        question: "Is a Return Policy in effect?",
        answer: `No operative Return Policy is in effect. A ${returnsPolicy.returnWindowDays}-day Return Window is only a planning assumption. ${returnsPolicy.condition} This is not a current Customer instruction.`,
      },
      {
        id: "damaged-missing",
        question: "Can I submit an Item Claim?",
        answer: `No. Real Fulfillment and Support Intake are unavailable, so there is no Item Claim process or public submission destination. A ${returnsPolicy.issueReportWindowDays}-day reporting window is only a planning assumption.`,
      },
      {
        id: "refund-timing",
        question: "Are real refunds available?",
        answer: `No live payment is accepted, so no real refund service is available. The ${returnsPolicy.refundProcessingWindow} estimate is a planning assumption, not an operative commitment.`,
      },
      {
        id: "exchanges",
        question: "Are Exchanges available?",
        answer:
          "Direct Exchanges are not planned as a default flow. A future Item Claim process may provide a Replacement only after a Legal Operator, real Fulfillment, and Support Intake exist.",
      },
      {
        id: "shipping-costs",
        question: "Are original shipping costs refundable?",
        answer:
          "No real shipping cost is charged, and no operative refund rule is in effect. Any future treatment of shipping costs requires a Legal Operator and reviewed Policy.",
      },
    ],
  },
  {
    id: "rewards",
    label: "helix rewards",
    summary: "Points, Redemption Tiers, Referrals, private feedback, and refunds.",
    items: [
      {
        id: "rewards-program",
        question: "How does helix rewards work?",
        answer:
          "Helix rewards is account-backed. Email-confirmed Account Holders receive a 100-Point welcome award once, earn 2 Points per eligible net merchandise dollar after successful sandbox payment, and can redeem 200, 400, or 600 Points for $5, $10, or $15 off one eligible Order.",
        links: [{ label: "helix rewards", href: "/rewards" }],
      },
      {
        id: "promo-codes",
        question: "Can I stack Redemption Tiers or promo codes?",
        answer:
          "No. Checkout applies at most one Redemption Tier or one Referral Offer. Stripe promotion-code entry is disabled so Points, Referral Offers, and free-shipping calculations stay server-authoritative.",
      },
      {
        id: "referrals",
        question: "How do referrals work?",
        answer:
          "An email-confirmed Account Holder can share a Referral Code. A referred Customer must sign in with a confirmed account and can use a 15% Referral Offer on a first qualifying Order of $50.00 or more. Self-referrals and stacking are blocked.",
      },
      {
        id: "private-feedback-reward",
        question: "Does private feedback earn Points?",
        answer:
          "Eligible Paid Orders can unlock one private first-party feedback request with a 300-Point Award. The Points Award is the same for positive, neutral, or negative sentiment. This is not a Trustpilot review and is not published publicly.",
      },
      {
        id: "trustpilot-rewards",
        question: "Do Trustpilot reviews earn Points?",
        answer:
          "No. Trustpilot invitations are independent from helix rewards. Helix does not award Points for writing, editing, or deleting a Trustpilot review, and sandbox Orders do not send real Trustpilot invitations.",
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
        question: "What will Support Intake cover?",
        answer:
          "The Contact page organizes Product, System, Account, Cart, Accessibility Feedback, Privacy Request, partnership, wholesale, and general Inquiry Types so details can be prepared while Support Intake is unavailable.",
        links: [{ label: "Contact", href: "/contact" }],
      },
      {
        id: "contact-intake",
        question: "Can I submit a Support Inquiry through the site?",
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
          "The Terms status page explains the absent Legal Operator boundary, Account and sandbox commerce status, current providers, and the unavailable public contact destination. It is not an operative Terms of Service.",
        links: [{ label: "Terms of Service", href: "/terms" }],
      },
      {
        id: "accessibility",
        question: "Where is the Accessibility Statement?",
        answer:
          "The Accessibility Statement explains the helix Accessibility Commitment, WCAG target, implemented practices, testing approach, and unavailable feedback channel.",
        links: [{ label: "Accessibility Statement", href: "/accessibility" }],
      },
      {
        id: "cookies",
        question: "What does the Cookie notice record?",
        answer:
          "The Cookie notice records only a Cookie Acknowledgement for the required and functional storage disclosure. It does not offer optional Cookie Preferences. Your Privacy Choices explains the current state of sale, sharing, and targeted-advertising controls.",
        links: [
          { label: "Cookie Policy", href: "/cookie-policy" },
          { label: "Your Privacy Choices", href: "/privacy-choices" },
        ],
      },
    ],
  },
];
