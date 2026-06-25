import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileForm, SignOutButton } from "@/components/account/AccountForms";
import { PrivateFeedbackForm } from "@/components/account/PrivateFeedbackForm";
import { getProfile } from "@/lib/auth/profile";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrdersForCurrentUser } from "@/lib/orders/server";
import { getRewardsSummaryForCurrentUser } from "@/lib/rewards/server";
import { formatPrice } from "@/lib/products";

export const metadata: Metadata = {
  title: "Account | Mei Pelle",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account/sign-in?next=%2Faccount");

  const [profile, orders, rewards] = await Promise.all([
    getProfile(user),
    getOrdersForCurrentUser().catch(() => []),
    getRewardsSummaryForCurrentUser().catch(() => null),
  ]);
  const verified = Boolean(user.email_confirmed_at);

  return (
    <div className="container account-dashboard">
      <div className="page-head page-head--account">
        <p className="eyebrow">Account</p>
        <h1>Dashboard</h1>
        <SignOutButton />
      </div>

      <section className="account-grid" aria-label="Account overview">
        <article className="account-section">
          <h2>Overview</h2>
          <dl className="account-details">
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Verification</dt>
              <dd>{verified ? "Verified" : "Pending email verification"}</dd>
            </div>
          </dl>
        </article>

        <article className="account-section">
          <h2>Profile</h2>
          <ProfileForm
            firstName={profile?.first_name ?? ""}
            lastName={profile?.last_name ?? ""}
          />
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
          <h2>Rewards</h2>
          <dl className="account-details">
            <div>
              <dt>Available points</dt>
              <dd>{rewards?.pointsBalance ?? 0}</dd>
            </div>
            <div>
              <dt>Lifetime points</dt>
              <dd>{rewards?.lifetimePoints ?? 0}</dd>
            </div>
            <div>
              <dt>Referral code</dt>
              <dd>{rewards?.referralCode ?? "Available after rewards setup"}</dd>
            </div>
          </dl>
          <Link href="/rewards" className="btn btn--ghost btn--editorial-rounded">
            Rewards
          </Link>
        </article>

        <article className="account-section">
          <h2>Private feedback</h2>
          {rewards && rewards.feedbackRequests.length > 0 ? (
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
              Eligible paid sandbox orders can unlock one private feedback
              request worth 300 points. This is first-party feedback, not a
              Trustpilot review.
            </p>
          )}
        </article>
      </section>
    </div>
  );
}
