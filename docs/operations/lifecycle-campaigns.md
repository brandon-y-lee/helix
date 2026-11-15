# Lifecycle campaigns (Ticket 485 / Spec 482)

## Scope and status

Source implementation only. Cart: 24-hour quiet period, 10% recipient-bound offer. Browse: latest available product after 24 hours, no discount. Welcome: one 15% first-purchase offer after explicit lifecycle confirmation. Review/win-back remains deferred to verified delivery. No provider resources, coupons, remote schema, schedules or actual sends are created here.

All application flags and per-purpose database email controls default off. The existing restricted sandbox recipient policy and Stripe sandbox verification remain mandatory. This does not enable production commerce. Offer hosted-rounding qualification in `lifecycle-offers.md` remains an activation blocker.

## Activation prerequisites (not performed)

- Apply reviewed predecessor and campaign migrations in the explicitly approved environment. Preserve existing consent evidence and historical receipts.
- Review/publish the native sources in `lib/marketing/lifecycle-template-sources.ts`; capture each published native ID and fingerprint. Add `lifecycle_welcome`, `lifecycle_cart`, and `lifecycle_browse` to the separately approved `HELIX_EMAIL_LIFECYCLE_CONTRACT.templates`, retaining confirmation/welcome-v1 slots. New consent generations freeze this contract. Never retrofit approvals into existing generations. Old welcome-v1 continues unchanged; older lifecycle generations lacking campaign approvals fail closed.
- Confirm approved Topic, sending domain, postal address, webhook verification, native preferences, verified account and valid 15%/10% coupon configuration. Missing or drifted templates/coupons block delivery; there is no raw-template fallback.
- Set the three new `private.email_controls` purposes individually only after approval, with accepted-after cutoffs matching authorized consent enrollment. The lifecycle consent and offer database controls must also be enabled. Application gates: `HELIX_LIFECYCLE_ENABLED`, `HELIX_MARKETING_ENABLED`, `HELIX_OFFERS_ENABLED`, and new `HELIX_LIFECYCLE_CAMPAIGNS_ENABLED`. Existing synchronization/dispatch gates remain separate.
- Arrange an external authenticated POST schedule to `/api/internal/lifecycle-campaigns` with the existing `HELIX_EMAIL_DISPATCH_SECRET`. No hosted cron is installed. One invocation considers at most one recipient/campaign, performs at most one offer grant and current delivery check, and cleans at most 100 activity rows. Set cadence according to verified provider throughput, then run existing preference synchronization and shared email dispatch. A read-only GET never admits campaigns.

## Identity, eligibility and recovery

The database selects canonical consent/activity, not caller-authored product/email events. Due cart/browse jobs expire 24 hours after due. Welcome has the same bounded due window from confirmation. Cart revisions identify meaningful mutation, not checkout-generation reads; successful handoff imposes a seven-day per-cart cooldown and a new mutation is required. New mutations invalidate unattempted old revisions. Paid/refunded conversions suppress the activity they converted, not every future mutation on a retained cart ID; verified checkout clearing rotates generation and later new cart activity can qualify. Availability, conversion and current verified account/email are checked again before first handoff.

Selection order is welcome, cart, browse. Admission and final handoff share recipient locking and the existing durable cap ledger: one promotion per24h, three per7d across old/new purposes and uncertain attempts. A durable least-recently-selected ordering, with a five-minute service-only retry backoff, makes unavailable addresses yield to unvisited recipients even when scheduler cadence exceeds five minutes. Per-recipient welcome/cart/browse admission precedence is unchanged. It is not a send reservation or entitlement renewal.

Pending checkouts and failed checkouts with a bound Session or possible provider invocation suppress discount promises, including across verified-account email changes. Definitively unsent historical failures do not permanently suppress new reminders. No campaign mutates financial state to make an offer usable. The offer is rechecked against configured Stripe account/coupon immediately before first provider handoff and its row is checked under the final transaction lock. Expired, held or used grants never become an advertised new discount.

First handoff freezes the existing request and provider idempotency key. Subsequent uncertain retries preserve that payload; they never regrant discounts or silently label attempted mail unsent. Withdrawal/provider suppression still dominates retries. Matched verified bounce/complaint/suppressed events record restrictive shared consent evidence. Unmatched/conflicting events do not change consent. The existing provider webhook signature and correlation checks are unchanged.

Order locks precede cart locks, which precede marketing address/subscriber locks, matching activity admission. Verified payment or withdrawal committed before the final preparation check suppresses unsent mail. As with the existing dispatcher, a purchase or withdrawal after preparation commits but before the external HTTP handoff cannot be atomically recalled. No claim is made of a distributed transaction with Stripe/Resend.

## Welcome popup

Public readiness never creates an offer or sends mail. It requires all four enabled/current subscription and welcome admission controls, lifecycle/offer database readiness, a verified configured coupon and valid immutable native confirmation/offer templates. Provider reads are single-flight and cached for at most30 seconds per server instance, including failures; flags are checked before every response. Database/provider configuration changes can take up to30 seconds to hide an already-ready popup. Readiness contains no customer data and responses are private/no-store.

The dialog appears after12 seconds only on home or product routes. It is keyboard dismissible, uses shared modal focus/scroll handling, and stores only a dismissal timestamp for30 days. Explicit unchecked consent precedes double confirmation. Terms disclose first purchase, verified matching account,14-day expiry, no stacking and merchandise-only discount. No code or entitlement is issued on form submission.

## Verification

Focused suites: `tests/lifecycle-campaigns.test.ts`, `lifecycle-readiness.test.ts`, `lifecycle-templates.test.ts`, `welcome-popup.test.tsx`, existing marketing/delivery suites. `node scripts/db/test-lifecycle-combined.mjs` installs actual consent/offer/campaign migrations and retains all predecessor assertions and real transactional races. `e2e/welcome-popup.spec.ts` mocks exact readiness/cart/subscription API boundaries and rejects every unexpected API or mutation; it cannot send real email. Run the supported `CI=1 pnpm verify:production` profile after source review; never invoke Playwright directly.
