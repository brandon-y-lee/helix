import type { Metadata } from "next";
import Link from "next/link";
import { PrivateFeedbackForm } from "@/components/account/PrivateFeedbackForm";
import { getRewardsSummaryForCurrentUser } from "@/lib/rewards/server";
import {
  HELIX_REWARDS_NAME,
  PRIVATE_FEEDBACK_POINTS,
  PURCHASE_POINTS_PER_DOLLAR,
  REFERRAL_DISCOUNT_PERCENT,
  REFERRAL_MINIMUM_SUBTOTAL_CENTS,
  REWARD_TIERS,
  WELCOME_REWARD_POINTS,
  pointsLedgerEntryLabel,
} from "@/lib/rewards/rules";
import { formatPrice } from "@/lib/products";

export const metadata: Metadata = {
  title: "helix rewards | helix",
  description:
    "helix rewards Points, redemptions, referrals, and private post-purchase feedback.",
};

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const rewards = await getRewardsSummaryForCurrentUser().catch(() => null);

  return (
    <div className="container rewards-page">
      <div className="page-head">
        <p className="eyebrow">Account program</p>
        <h1>{HELIX_REWARDS_NAME}</h1>
      </div>

      {rewards === null ? (
        <section className="checkout-result__panel" role="status">
          <p>helix rewards is temporarily unavailable.</p>
          <p className="account-muted">
            We could not load your Points or referral benefits. Try again in a moment.
          </p>
        </section>
      ) : (
        <>
          <section className="checkout-result__panel rewards-hero">
            <p>
              Earn {PURCHASE_POINTS_PER_DOLLAR} Points per eligible merchandise
              dollar, receive a {WELCOME_REWARD_POINTS}-Point welcome award once with
              a confirmed account, and earn a {PRIVATE_FEEDBACK_POINTS}-Point Award
              for one private first-party post-purchase feedback submission per
              eligible Paid Order.
            </p>
            <p className="account-muted">
              Points do not currently expire. Points have no cash value and cannot be
              transferred. Redemption Tiers cannot stack with Referral Offers.
            </p>
          </section>

          <section className="account-grid" aria-label="helix rewards overview">
            <article className="account-section">
              <h2>Redemption Tiers</h2>
              <ul className="ledger-list">
                {REWARD_TIERS.map((tier) => (
                  <li key={tier.id}>
                    <span>{tier.points} Points</span>
                    <span>{tier.label}</span>
                    <span>{formatPrice(tier.discountCents)}</span>
                    <span>One per Order</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="account-section">
              <h2>Referrals</h2>
              <p className="account-muted">
                Referred friends can receive {REFERRAL_DISCOUNT_PERCENT}% off their
                first qualifying Order of {formatPrice(REFERRAL_MINIMUM_SUBTOTAL_CENTS)}
                {" "}or more before the Referral Offer is applied. Confirmed accounts only; no
                self-referrals and no stacking.
              </p>
              {rewards.authenticated ? (
                <div className="form-status" role="status">
                  Your Referral Code: {rewards.referralCode ?? "initializing"}
                </div>
              ) : (
                <Link
                  href="/account/sign-in?next=%2Frewards"
                  className="btn btn--ghost btn--editorial-rounded"
                >
                  Sign in for a Referral Code
                </Link>
              )}
            </article>

            <article className="account-section">
              <h2>Your Points</h2>
              {rewards.authenticated ? (
                <dl className="account-details">
                  <div>
                    <dt>Available Points Balance</dt>
                    <dd>{rewards.pointsBalance}</dd>
                  </div>
                  <div>
                    <dt>Lifetime Points</dt>
                    <dd>{rewards.lifetimePoints}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{rewards.emailConfirmed ? "Confirmed" : "Confirmation pending"}</dd>
                  </div>
                </dl>
              ) : (
                <p className="account-muted">
                  Sign in or create an account to earn and redeem Points, submit
                  private feedback, and use referrals.
                </p>
              )}
            </article>

            <article className="account-section">
              <h2>Points Ledger</h2>
              {rewards.recentLedger.length ? (
                <ul className="ledger-list">
                  {rewards.recentLedger.map((entry) => (
                    <li key={entry.id}>
                      <span>{entry.description}</span>
                      <span>{pointsLedgerEntryLabel(entry.entry_type)}</span>
                      <span>{entry.points > 0 ? `+${entry.points}` : entry.points}</span>
                      <span>{new Date(entry.created_at).toLocaleDateString("en-US")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="account-muted">No Points Ledger entries yet.</p>
              )}
            </article>

            <article className="account-section">
              <h2>Private feedback</h2>
              <p className="account-muted">
                This is a private helix survey. It is not a Trustpilot review,
                is not public, and earns the same Points Award regardless of sentiment.
              </p>
              {rewards.feedbackRequests.length ? (
                <ul className="feedback-list">
                  {rewards.feedbackRequests.map((request) => (
                    <li key={request.id}>
                      <span>{request.order_number}</span>
                      <span>{request.points} Points</span>
                      <PrivateFeedbackForm
                        feedbackId={request.id}
                        orderNumber={request.order_number}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="account-muted">
                  No eligible feedback requests are available.
                </p>
              )}
            </article>

            <article className="account-section">
              <h2>Trustpilot</h2>
              <p className="account-muted">
                Trustpilot invitations are independent from helix rewards. Helix does
                not award Points for writing, editing, or deleting a Trustpilot
                review, and sandbox orders do not send real Trustpilot invitations.
              </p>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
