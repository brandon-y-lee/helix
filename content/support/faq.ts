import {
  returnsPolicy,
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
          "You can complete Stripe-hosted Checkout in sandbox mode only. It can collect sandbox checkout details and create sandbox order records, but it does not create a real charge, shipment, fulfillment, or Trustpilot invitation. When development email is enabled, demo order confirmations can be sent to approved test recipients only.",
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
    summary: "Standard shipping, order processing, and tracking updates.",
    items: [
      {
        id: "free-shipping",
        question: "Is standard shipping available?",
        answer:
          "Helix offers free standard shipping to delivery addresses within the United States. Available shipping options are shown at checkout.",
      },
      {
        id: "shipping-destinations",
        question: "Where is standard shipping available?",
        answer:
          "Free standard shipping is available to delivery addresses within the United States. Check the available shipping options at checkout.",
      },
      {
        id: "shipping-timing",
        question: "When will my order ship and tracking become available?",
        answer:
          "Most orders ship 5–7 business days after being placed. Processing time may vary depending on the items in your order and their source location. Tracking information becomes available within 48 hours after a shipment is dispatched. Once tracking is available, Helix will email a link to track the package. For orders fulfilled by international merchants, tracking may not update until the package reaches the United States. Tracking may occasionally be delayed or replaced.",
      },
      {
        id: "shipping-address-changes",
        question: "Can I change my shipping address after checkout?",
        answer:
          "Contact Customer Care about an address change. Orders may be canceled before they are processed for shipment, with a full refund to the original payment method. Once an order is processed for shipment, it must be returned in accordance with the Return Policy.",
        links: [{ label: "Customer Care", href: "/contact" }],
      },
    ],
  },
  {
    id: "returns",
    label: "Returns & Refunds",
    summary: "Return requests, product condition, Item Claims, Exchanges and refunds.",
    items: [
      {
        id: "return-window",
        question: "What is the return policy?",
        answer: `Helix offers free returns on all orders. Return requests must be submitted within ${returnsPolicy.returnWindowDays} days of receipt. ${returnsPolicy.condition} Products must not otherwise be altered, marked or damaged. Return the product with its original packaging where available. When a return is approved, a prepaid return label will be sent by email. Expedited shipping fees are non-refundable. Rejected items may be held until a reshipment fee is paid; Customer Care will explain the available options.`,
        links: [{ label: "Request a return", href: "/contact" }],
      },
      {
        id: "damaged-missing",
        question: "What should I do about an issue with my order?",
        answer:
          "Contact Customer Care about damaged, missing, or incorrect items and review the Return Policy for return conditions.",
        links: [
          { label: "Customer Care", href: "/contact" },
          { label: "Return Policy", href: "/terms" },
        ],
      },
      {
        id: "refund-timing",
        question: "When will I receive my refund?",
        answer:
          "Each return is inspected against its original order record. Once a return is completed, a refund will be issued to your original payment method within 2 business days. Refunds are processed through Stripe and typically appear within 7–12 business days after they are issued, depending on your bank and payment processing times.",
      },
      {
        id: "exchanges",
        question: "Are Exchanges available?",
        answer:
          "Helix does not offer direct exchanges. Return the merchandise for a refund and place a new order for the preferred item.",
      },
      {
        id: "shipping-costs",
        question: "Are original shipping costs refundable?",
        answer:
          "Helix offers free standard shipping to delivery addresses within the United States. Expedited shipping fees are non-refundable. See the Terms & Conditions or contact Customer Care about your order.",
        links: [
          { label: "Terms & Conditions", href: "/terms" },
          { label: "Customer Care", href: "/contact" },
        ],
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
    summary: "Support routing and current intake availability.",
    items: [
      {
        id: "contact-topics",
        question: "What does Support Intake cover?",
        answer:
          "The Contact page organizes Product, System, Account, Cart, Accessibility Feedback, Privacy Request, partnership, wholesale, and general Inquiry Types. Check the page for current intake availability.",
        links: [{ label: "Contact", href: "/contact" }],
      },
      {
        id: "contact-intake",
        question: "Can I submit a Support Inquiry through the site?",
        answer:
          supportPolicy.contactStatus +
          " When the form is available, it stores accepted inquiries privately for review. Wait for the form to confirm acceptance; acceptance does not mean an email has been delivered. You can also email support@helixskin.us. We'll get back to you within the countdown shown on the Contact page, ending at the next weekday reply target: noon Pacific.",
        links: [{ label: "Contact", href: "/contact" }],
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
          "The Privacy Policy explains how we collect, use and protect personal information. We may keep order and billing records for up to 7 years as required for accounting and tax purposes. When information is no longer needed, we delete it or anonymize it securely. For account-deletion requests, we promptly delete or de-identify data unless there is a legal reason to retain it. We regularly review our security procedures and use appropriate safeguards for international data transfers. For privacy requests, email support@helixskin.us with Privacy in the subject line. We may verify your identity before completing a request and will respond within the period required by applicable law.",
        links: [{ label: "Privacy Policy", href: "/privacy" }],
      },
      {
        id: "terms",
        question: "Where are the Terms & Conditions?",
        answer:
          "The Terms & Conditions explain use of the Helix website and services, ordering, shipping, returns, refunds, and other conditions. The linked policies and FAQs form part of those Terms.",
        links: [{ label: "Terms & Conditions", href: "/terms" }],
      },
      {
        id: "accessibility",
        question: "Where is the Accessibility Statement?",
        answer:
          "We strive to maintain compliance with WCAG 2.1 Level AA and continuously work to improve website accessibility. If you encounter a barrier, email support@helixskin.us with Accessibility Barriers in the subject line and describe the feature or suggest an improvement.",
        links: [{ label: "Accessibility Statement", href: "/accessibility" }],
      },
      {
        id: "cookies",
        question: "What can I manage in Your Privacy Choices?",
        answer:
          "Your Privacy Choices in the footer lets you allow or turn off optional analytics and marketing. Confirm my choices saves your selection in this browser; closing without confirming discards changes. Global Privacy Control keeps marketing off while your browser sends that signal. Required cookies support account access and shopping; you can manage cookies through your browser settings.",
        links: [
          { label: "Cookie Policy", href: "/cookie-policy" },
          { label: "Your Privacy Choices", href: "/privacy-choices" },
        ],
      },
    ],
  },
];
