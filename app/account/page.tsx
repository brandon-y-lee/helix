import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AccountUnavailable } from "@/components/account/AccountUnavailable";
import { ProfileForm, SignOutButton } from "@/components/account/AccountForms";
import { PrivateFeedbackForm } from "@/components/account/PrivateFeedbackForm";
import { getProfile } from "@/lib/auth/profile";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrdersForCurrentUser } from "@/lib/orders/server";
import { getRewardsSummaryForCurrentUser } from "@/lib/rewards/server";
import { formatPrice } from "@/lib/products";
import {
  isSupabaseNetworkError,
  logSupabaseUnavailable,
} from "@/lib/supabase/network";

export const metadata: Metadata = {
  title: "Account | Mei Pelle",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const requestHeaders = await headers();
  const requestId = requestHeaders.get("x-request-id");
  const startedAt = Date.now();
  let user;

  try {
    user = await getCurrentUser();
  } catch (error) {
    if (!isSupabaseNetworkError(error)) throw error;
    logSupabaseUnavailable(error, {
      operation: "account.identity",
      route: "/account",
      runtime: "nodejs",
      requestId,
      elapsedMs: Date.now() - startedAt,
    });
    return <AccountUnavailable />;
  }

  if (!user) redirect("/account/sign-in?next=%2Faccount");

  const accountData = await Promise.all([
    getProfile(user),
    getOrdersForCurrentUser(),
    getRewardsSummaryForCurrentUser(),
  ]).catch((error: unknown) => {
    if (!isSupabaseNetworkError(error)) throw error;
    logSupabaseUnavailable(error, {
      operation: "account.dashboard",
      route: "/account",
      runtime: "nodejs",
      requestId,
      elapsedMs: Date.now() - startedAt,
    });
    return null;
  });
  if (!accountData) return <AccountUnavailable />;
  const [profile, orders, rewards] = accountData;
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
              <dt>Referral code</dt>
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
