import type { ReactNode } from "react";
import Link from "next/link";
import { FAQDisclosure } from "@/components/content/FAQDisclosure";
import { formatPrice } from "@/lib/products";
import type { RewardsSummary } from "@/lib/rewards/server";

export type AccountDashboardOrder = {
  providerMode?: "sandbox" | "live";
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

function AccountSection({ id, title, open = false, children }: {
  id: string;
  title: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="account-disclosure">
      <FAQDisclosure question={title} panelId={`account-panel-${id}`} initiallyOpen={open}>
        <div className="account-disclosure__body">{children}</div>
      </FAQDisclosure>
    </div>
  );
}

function AccountEmpty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="account-empty"><h3>{title}</h3><div>{children}</div></div>;
}

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
      <header className="account-intro">
        <p className="eyebrow">helix / Account</p>
        <h1>Your account</h1>
        <p className="account-intro__description">A space for you.<br />The details behind your daily routine.</p>
        <div className="account-identity">
          <p>Welcome back.</p>
          {email && <p className="account-identity__email">{email}</p>}
          <p className="account-identity__status">{verified ? "Verified" : "Pending email verification"}</p>
          {signOutControl}
        </div>
        <div className="account-help">
          <p>Here to help.</p>
          <p>Questions about your account or routine?</p>
          <Link href="/contact">Contact helix <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      <section className="account-disclosures" aria-label="Manage your account">
        <AccountSection id="settings" title="Account settings" open>
          <p className="account-panel-intro">Make yourself at home. Keep your personal details up to date.</p>
          <div className="account-settings-layout">
            <section aria-labelledby="account-profile-heading">
              <h3 id="account-profile-heading">Personal information</h3>
              {profileForm}
            </section>
            <section className="account-security" aria-labelledby="account-security-heading">
              <h3 id="account-security-heading">Sign-in & security</h3>
              <dl className="account-details"><div><dt>Email address</dt><dd>{email ?? "Email unavailable"}</dd></div></dl>
              <p className="account-muted">For a new password, request a secure reset link.</p>
              <Link href="/account/forgot-password" className="account-text-link">Reset password <span aria-hidden="true">↗</span></Link>
            </section>
          </div>
        </AccountSection>

        <AccountSection id="orders" title="Order history">
          {orders.length > 0 ? (
            <ul className="account-orders" aria-label="Your orders">
              {orders.map((order) => (
                <li key={order.id}>
                  <div>
                    <h3>{order.order_number}</h3>
                    {order.providerMode !== "live" && <p>Sandbox order</p>}
                    <p className="account-order-status">{order.status.replaceAll("_", " ")}</p>
                  </div>
                  <dl>
                    <div><dt className="sr-only">Total</dt><dd>{formatPrice(order.total_cents)}</dd></div>
                    {order.providerMode !== "live" && (
                      <div><dt className="sr-only">Points earned</dt><dd>{order.reward_points_earned} pts</dd></div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <AccountEmpty title="Your routine starts here.">
              <p>Orders placed while signed in appear here. Guest orders do not appear in account history.</p>
              <Link href="/collections/shop" className="account-text-link">Explore skincare <span aria-hidden="true">↗</span></Link>
            </AccountEmpty>
          )}
        </AccountSection>

        <AccountSection id="addresses" title="Address book">
          <AccountEmpty title="One less thing to remember. Soon.">
            <p>Saving addresses to your account is not available yet. You can enter a shipping address during checkout.</p>
          </AccountEmpty>
        </AccountSection>

        <AccountSection id="payments" title="Payment methods">
          <AccountEmpty title="Payment details, kept at checkout.">
            <p>Saved payment methods are not available in your account. You enter payment details at checkout.</p>
          </AccountEmpty>
        </AccountSection>

        <AccountSection id="rewards" title="Rewards">
          {rewards ? (
            <dl className="account-rewards">
              <div><dt>Available Points Balance</dt><dd>{rewards.pointsBalance}</dd></div>
              <div><dt>Lifetime Points</dt><dd>{rewards.lifetimePoints}</dd></div>
              <div><dt>Referral Code</dt><dd>{rewards.referralCode ?? "Available after rewards setup"}</dd></div>
            </dl>
          ) : <AccountEmpty title="Rewards are unavailable right now."><p>We cannot show your balance at the moment. Please try again later.</p></AccountEmpty>}
          <Link href="/rewards" className="account-text-link">Explore helix rewards <span aria-hidden="true">↗</span></Link>
        </AccountSection>

        <AccountSection id="reviews" title="Reviews">
          <Link href="/account/reviews" className="account-text-link">Your public product reviews <span aria-hidden="true">↗</span></Link>
          <p className="account-panel-intro">Your experience matters. Feedback shared here is private, not a published product review or a Trustpilot review.</p>
          {rewards && rewards.feedbackRequests.length > 0 ? (
            <ul className="account-feedback">
              {rewards.feedbackRequests.map((request) => (
                <li key={request.id}>
                  <div className="account-feedback__heading"><h3>{request.order_number}</h3><span>{request.points} Points</span></div>
                  {renderFeedback(request)}
                </li>
              ))}
            </ul>
          ) : <AccountEmpty title={rewards ? "Nothing to share just yet." : "Feedback requests are unavailable."}>
            <p>{rewards ? "Eligible sandbox orders can unlock one private feedback request with a 300-Point Award." : "We cannot check for eligible feedback requests right now. Please try again later."}</p>
          </AccountEmpty>}
        </AccountSection>

        <AccountSection id="replenishment" title="Auto-replenishment">
          <AccountEmpty title="A routine on your terms.">
            <p>Auto-replenishment is not available yet. No recurring orders or subscription enrollment are offered here.</p>
            <Link href="/collections/shop" className="account-text-link">Shop when you need it <span aria-hidden="true">↗</span></Link>
          </AccountEmpty>
        </AccountSection>
      </section>
    </div>
  );
}
