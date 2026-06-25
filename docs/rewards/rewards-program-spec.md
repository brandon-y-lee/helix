# Mei Pelle Rewards Program Spec

Date: 2026-06-25

Program display name: `MEI PELLE REWARDS`.

This spec is original Mei Pelle program behavior. Leaders Cosmetics USA's
rewards page was inspected only for broad structural patterns such as earning,
redemption, referral, and account modules:
https://www.leaderscosmeticsusa.com/pages/royalty-rewards

Trustpilot guidance was inspected separately:

- Business guidelines:
  https://legal.trustpilot.com/for-businesses/guidelines-for-businesses/1
- Reviewer guidelines:
  https://legal.trustpilot.com/for-reviewers/guidelines-for-reviewers/1
- Developer docs: https://developers.trustpilot.com/

No points, discounts, or benefits may be offered for writing, editing, or
deleting a Trustpilot review.

## Account Requirement

An authenticated, email-confirmed account is required to:

- earn points
- redeem points
- submit eligible private feedback
- create or use referral offers
- receive referral rewards

Guest sandbox purchases do not retroactively earn rewards in this task.

## Earning

- Welcome: 100 points once per confirmed account.
- Purchases: `floor(eligible_net_merchandise_cents * 2 / 100)`.
- Purchase points exclude shipping, tax, cancellations, failed payments, and
  refunded merchandise.
- Private post-purchase feedback: 300 points once per eligible paid order.

Private feedback is first-party, private, not published to Trustpilot, not
sentiment-gated, and not public-review activity.

## Redemption

Exactly one redemption tier may apply per order:

- 200 points -> $5 off
- 400 points -> $10 off
- 600 points -> $15 off

Rules:

- no stacking redemption tiers
- no stacking with referral offers
- no cash value
- no transfer between accounts
- discount cannot exceed eligible merchandise subtotal
- points are reserved before Checkout Session creation
- points are released on Session creation failure, expiration, cancellation, or
  failed payment
- purchase points are awarded only after verified sandbox payment

## Referrals

Friend offer:

- 15% off the referred customer's first qualifying order
- $50 minimum eligible merchandise subtotal before discount
- confirmed account required
- one offer per referred account
- no stacking

Referrer reward:

- one 15%-off reward after the referred friend completes a qualifying paid order
- $50 minimum subtotal when used later
- one-time use
- void if the referred qualifying order is fully canceled or refunded

Security:

- referral codes are non-sequential and do not expose user IDs
- self-referrals are blocked
- first-order eligibility is checked server-side
- referral cookies are HttpOnly and only establish temporary attribution

## Ledger Model

Supabase stores an immutable ledger plus a cached loyalty account balance.
Browser clients may read their own rewards data but cannot insert or update
orders, payment attempts, webhook events, ledger entries, referrals, or private
feedback rewards.

Idempotency sources include:

- `welcome:<user_id>`
- `purchase:<order_id>`
- `reward-reserve:<order_id>`
- `reward-release:<order_id>`
- `private-feedback:<order_id>`
- `referral:<order_id>`
- `referral-reward:<attribution_id>`

Refunds preserve history. Full refunds mark orders refunded, reverse earned
purchase points once, restore redeemed points once, and void available referral
rewards tied to the refunded order.

## UI Surfaces

- `/rewards` explains public program rules and signed-in state.
- `/cart` shows estimated points, available points, affordable tiers, and a
  sandbox Checkout notice.
- `/account` shows sandbox order history, points, referral code, recent
  activity, and eligible private-feedback forms.
- Trustpilot copy explicitly states that Trustpilot reviews do not earn points.
