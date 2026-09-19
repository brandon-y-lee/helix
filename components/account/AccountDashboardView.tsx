import type { ReactNode } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import type { RewardsSummary } from "@/lib/rewards/server";

export type AccountDashboardOrder = {
  id: string;
  order_number: string;
  status: string;
  total_cents: number;
  reward_points_earned: number;
};

export type AccountDashboardRewards = Pick<
  RewardsSummary,
  "pointsBalance" | "lifetimePoints" | "referralCode" | "feedbackRequests"
>;

export type AccountDashboardViewProps = {
  email: string | undefined;
  verified: boolean;
  orders: AccountDashboardOrder[];
  rewards: AccountDashboardRewards | null;
  profileForm: ReactNode;
  signOutControl: ReactNode;
  renderFeedback: (request: RewardsSummary["feedbackRequests"][number]) => ReactNode;
};

export function AccountDashboardView({
  email,
  verified,
  orders,
  rewards,
  profileForm,
  signOutControl,
  renderFeedback,
}: AccountDashboardViewProps) {
  return (
    <div className="container account-dashboard">
      <div className="page-head page-head--account">
        <p className="eyebrow">Account</p>
        <h1>Dashboard</h1>
        {signOutControl}
      </div>

      <section className="account-grid" aria-label="Account overview">
        <article className="account-section">
          <h2>Overview</h2>
          <dl className="account-details">
            <div>
              <dt>Email</dt>
              <dd>{email}</dd>
            </div>
            <div>
              <dt>Verification</dt>
              <dd>{verified ? "Verified" : "Pending email verification"}</dd>
            </div>
          </dl>
        </article>

        <article className="account-section">
          <h2>Profile</h2>
          {profileForm}
        </article>

        <article className="account-section">
          <h2>Password</h2>
          <p className="account-muted">Change your password through a secure reset link.</p>
          <Link href="/account/forgot-password" className="btn btn--ghost btn--editorial-rounded">
            Password reset
          </Link>
        </article>

        <article className="account-section">
          <h2>Orders</h2>
          {orders.length > 0 ? (
            <ul className="order-list">
              {orders.map((order) => (
                <li key={order.id}>
                  <span>{order.order_number}</span>
                  <span>{order.status}</span>
                  <span>{formatPrice(order.total_cents)}</span>
                  <span>{order.reward_points_earned} pts</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="account-muted">
              Sandbox order history will appear here after authenticated
              checkout. Guest orders do not appear in account history.
            </p>
          )}
        </article>

        <article className="account-section">
          <h2>helix rewards</h2>
          <dl className="account-details">
            <div>
              <dt>Available Points Balance</dt>
              <dd>{rewards?.pointsBalance ?? 0}</dd>
            </div>
            <div>
              <dt>Lifetime Points</dt>
              <dd>{rewards?.lifetimePoints ?? 0}</dd>
            </div>
            <div>
              <dt>Referral Code</dt>
              <dd>{rewards?.referralCode ?? "Available after rewards setup"}</dd>
            </div>
          </dl>
          <Link href="/rewards" className="btn btn--ghost btn--editorial-rounded">
            helix rewards
          </Link>
        </article>

        <article className="account-section">
          <h2>Private feedback</h2>
          {rewards && rewards.feedbackRequests.length > 0 ? (
            <ul className="feedback-list">
              {rewards.feedbackRequests.map((request) => (
                <li key={request.id}>
                  <span>{request.order_number}</span>
                  <span>{request.points} Points</span>
                  {renderFeedback(request)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="account-muted">
              Eligible Paid Orders can unlock one private feedback request with
              a 300-Point Award. This is first-party feedback, not a
              Trustpilot review.
            </p>
          )}
        </article>
      </section>
    </div>
  );
}
