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
            Your Points, Referral Code, and eligible benefits have not changed.
            Try again in a moment.
          </p>
        </section>
      ) : (
        <>
          <section className="checkout-result__panel rewards-hero">
            <p>
              Earn {PURCHASE_POINTS_PER_DOLLAR} points per eligible merchandise
              dollar, receive {WELCOME_REWARD_POINTS} points once with a confirmed
              account, and earn {PRIVATE_FEEDBACK_POINTS} points for one private
              first-party post-purchase feedback submission per eligible paid order.
            </p>
            <p className="account-muted">
              Points do not currently expire. Rewards have no cash value, cannot be
              transferred, and cannot stack with referral offers.
            </p>
          </section>

          <section className="account-grid" aria-label="helix rewards overview">
            <article className="account-section">
              <h2>Redeem points</h2>
              <ul className="ledger-list">
                {REWARD_TIERS.map((tier) => (
                  <li key={tier.id}>
                    <span>{tier.points} points</span>
                    <span>{tier.label}</span>
                    <span>{formatPrice(tier.discountCents)}</span>
                    <span>One per order</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="account-section">
              <h2>Referrals</h2>
              <p className="account-muted">
                Referred friends can receive {REFERRAL_DISCOUNT_PERCENT}% off their
                first qualifying order of {formatPrice(REFERRAL_MINIMUM_SUBTOTAL_CENTS)}
                {" "}or more before the referral discount. Confirmed accounts only; no
                self-referrals and no stacking.
              </p>
              {rewards.authenticated ? (
                <div className="form-status" role="status">
                  Your referral code: {rewards.referralCode ?? "initializing"}
                </div>
              ) : (
                <Link
                  href="/account/sign-in?next=%2Frewards"
                  className="btn btn--ghost btn--editorial-rounded"
                >
                  Sign in for referral code
                </Link>
              )}
            </article>

            <article className="account-section">
              <h2>Your points</h2>
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
                  Sign in or create an account to earn, redeem, submit private
                  feedback, and use referrals.
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
                <p className="account-muted">No rewards activity yet.</p>
              )}
            </article>

            <article className="account-section">
              <h2>Private feedback</h2>
              <p className="account-muted">
                This is a private helix survey. It is not a Trustpilot review,
                is not public, and earns the same points regardless of sentiment.
              </p>
              {rewards.feedbackRequests.length ? (
                <ul className="feedback-list">
                  {rewards.feedbackRequests.map((request) => (
                    <li key={request.id}>
                      <span>{request.order_number}</span>
                      <span>{request.points} points</span>
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
                Trustpilot invitations are independent from rewards. Helix does
                not award points for writing, editing, or deleting a Trustpilot
                review, and sandbox orders do not send real Trustpilot invitations.
              </p>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
