# Approved local factual corrections

Revision boundary: `26e2911` → the subsequent local correction commit. The owner approved **payments, tracking, accounts and pricing only**. No public activation, provider/configuration change, push, merge, or new operational commitment is authorized.

## Exact scope

- Privacy: 18 exact text substitutions/removals. Terms: 4. Every find/replacement pair is recorded in `scripts/legal/approved-factual-corrections.json` and copied to the per-page `factualCorrections` arrays in `substitutions.json`.
- No headings, paragraph/list containers, emphasis, IDs, links, shared navigation, fonts or layout CSS change. Source snapshots are unchanged. Accessibility source/output remains byte-for-byte unchanged from `26e2911`.
- Only customer-facing payment/tracking/account/pricing language changes. Conditional “Payment details entered through Stripe Checkout…” identifies the implemented processor without announcing live-payment availability; no development or sandbox disclaimer is inserted.
- Refund-provider name changes Square → Stripe; the existing refund timing and returns promises remain unchanged, pending disposition.
- Tracking claims of active Vercel/Google/Meta analytics or advertising, default marketing tracking, working optional cookie controls and GPC handling are removed. Required storage language remains; no tracking capability is activated.
- Account disclosure now identifies email/password, optional first/last name, order history and customer identifiers. Google-login data collection and self-service deletion claims are removed. No manual rights-handling promise is added.
- Terms now says “Prices are the catalog prices displayed on our website and are validated at checkout.” The one-item-per-customer sentence is removed. The remainder of the pricing and availability text stays verbatim.

## Preserved pending decisions

Accessibility is unchanged. There is no evidence of verified conformance; no new implication of verification or unaccepted target wording is introduced. The original Accessibility wording, including the fashion-category sentence, remains pending direction. Shipping timing, free returns, refund timing, privacy-request methods/handling, retention periods and transfer safeguards are retained as previously requested. This local copy is not an adoption or operational-compliance attestation.

## Exact approved text delta

### privacy-policy

1. **accounts**
   - Before: Username and password, order history, customer identifiers, and, when you choose Google login, your Google-verified email address, name, and profile image. Google does not share your Google password with Helix.
   - After: Email address and password, optional first and last name, order history, and customer identifiers.
2. **payments**
   - Before: Payment details required to process your order are collected through Square's PCI-compliant payment fields. Square tokenizes the payment information for processing; Helix does not receive or store your full card number or security code.
   - After: Payment details entered through Stripe Checkout are handled by Stripe; Helix does not receive or store your full card number or security code.
3. **tracking**
   - Before: , to analyze site usage
   - After: (remove this exact text only)
4. **tracking**
   - Before: and to analyze and improve our website and offerings. For example, we analyze browsing data to understand which products and pages are popular and to optimize our site's performance.
   - After: and to improve our website and offerings.
5. **tracking**
   - Before: We use advertising and measurement technologies to understand how people find Helix, measure advertising results, connect product interactions with our catalog, and show relevant advertisements, subject to your privacy choices.
   - After: Optional analytics and advertising technologies are not active on this website.
6. **tracking**
   - Before: while marketing and analytics are based on your consent or on our legitimate interest to run our business responsibly.
   - After: while marketing is based on your consent or on our legitimate interest to run our business responsibly.
7. **tracking**
   - Before: We also use optional analytics and advertising technologies as described below.
   - After: (remove this exact text only)
8. **tracking**
   - Before: Helix uses Vercel Web Analytics without cookies for anonymous, aggregate page and shopping-event counts. Optional Google Analytics and Vercel performance tools are disabled unless you enable Analytics Cookies in Your Privacy Choices. Marketing tracking, including Meta's advertising technologies, is enabled by default unless you turn off Marketing Cookies or your browser sends a Global Privacy Control signal.
   - After: Optional analytics and advertising technologies are not active on this website.
9. **tracking**
   - Before: You can review and change these settings through Your Privacy Choices in the website footer. Your selections are saved in the browser you use. You may need to set them again if you clear browser storage or use another browser or device. We recognize Global Privacy Control as a request to opt out of advertising-related sharing for that browser.
   - After: Your Privacy Choices in the website footer explains our use of required browser storage.
10. **tracking**
   - Before: Turning off optional analytics or marketing tracking does not prevent you from creating an account or placing an order.
   - After: (remove this exact text only)
11. **tracking**
   - Before: You can opt out of advertising-related sharing through Your Privacy Choices or a Global Privacy Control signal.
   - After: (remove this exact text only)
12. **payments**
   - Before: When you pay by card or an eligible digital payment method, the information needed to process the transaction is sent to Square. Square handles the payment through PCI-compliant infrastructure and returns the payment result needed to complete the order.
   - After: When you enter card payment details through Stripe Checkout, those details are handled by Stripe.
13. **accounts**
   - Before: When you choose Google login, Google authenticates you and provides Helix with your verified email address, name, and profile image.
   - After: (remove this exact text only)
14. **tracking**
   - Before: Vercel receives anonymous, aggregate page and shopping-event data through its cookie-free Web Analytics service. We also share website activity and related information with Meta and, when optional analytics is enabled, Google Analytics and Vercel performance tools. Depending on the service and your choices, this can include pages and products viewed, shopping and purchase events, browser identifiers, IP address and device information. For advertising measurement and matching, we may also send a hashed version of your email address or phone number to Meta. Hashing transforms these details for matching; it does not make them anonymous.
   - After: Optional analytics and advertising technologies are not active on this website.
15. **payments**
   - Before: (for example, to Square or Google in the U.S.)
   - After: (for example, to Stripe in the U.S.)
16. **accounts**
   - Before: You can also update or delete your account data anytime via your user account or by contacting us.
   - After: You can update your name and password through your user account or contact us about your account data.
17. **payments**
   - Before: Payment information entered through Square's payment fields is tokenized for processing, and Helix does not receive or store full card numbers or security codes.
   - After: Payment details entered through Stripe Checkout are handled by Stripe, and Helix does not receive or store full card numbers or security codes.
18. **tracking**
   - Before: To opt out of advertising-related sharing, open Your Privacy Choices in the website footer and turn off Marketing Cookies, or use a browser that sends a Global Privacy Control signal.
   - After: (remove this exact text only)

### terms-conditions

1. **pricing**
   - Before: Items are limited to one per customer.
   - After: (remove this exact text only)
2. **pricing**
   - Before: Live Price is derived from the lowest current asking price observed for an item across Helix's sourcing network.
   - After: Prices are the catalog prices displayed on our website and are validated at checkout.
3. **payments**
   - Before: Payments are securely processed by Square through PCI-compliant infrastructure. Card information entered in Square payment fields is tokenized for processing; Helix does not receive or store card numbers or security codes.
   - After: Card payment details entered through Stripe Checkout are handled by Stripe; Helix does not receive or store card numbers or security codes.
4. **payments**
   - Before: Refunds are processed through Square
   - After: Refunds are processed through Stripe

## Focused validation

- `pnpm exec vitest run tests/legal-policy-parity.test.tsx tests/customer-rewards-migration.test.ts tests/footer-support.test.tsx tests/mobile-services.test.tsx --maxWorkers=2` — 4 files, 20 tests passed. The added scope guard checks that only the four approved areas change, unresolved clauses remain, and no sandbox/development disclaimer or live activation announcement appears.
- Complete ordered source-vs-copy block comparison passes after only identity substitutions plus the exact correction allowlist. Link parity and unchanged Accessibility are still covered.
- `pnpm typecheck` — passed.
- Targeted ESLint with `ESLINT_USE_FLAT_CONFIG=false` — passed, existing eslintrc deprecation notice only.
- `git diff --check` — passed.
- Initial guard failure was a test regex matching the existing IP word “developments”; word boundaries corrected the assertion without editing that source clause.
- Preview was stopped when this continuation began; restarted only the existing isolated local preview on port 3036. No contact preview/worktree or shared dev was changed.
- Focused Chromium rendered parity results and independent review are recorded alongside this report. Full suites/build and remote checks are unnecessary for this bounded local text revision and were not run.

## Local evidence

Preview paths: `http://127.0.0.1:3036/privacy`, `/terms`, `/accessibility`. Run from `/tmp/helix-legal-revetir`: `pnpm dev --hostname 127.0.0.1 --port 3036`. Revised local browser artifacts use `/tmp/helix-legal-artifacts/factual-corrections`, preserving earlier Library-backed screenshot files and identities. No new Library upload was performed. Existing Library IDs show the prior complete-copy checkpoint, not this corrected text.
