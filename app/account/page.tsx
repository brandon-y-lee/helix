import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileForm, SignOutButton } from "@/components/account/AccountForms";
import { getProfile } from "@/lib/auth/profile";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Account | Mei Pelle",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account/sign-in?next=%2Faccount");

  const profile = await getProfile(user);
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
          <Link href="/account/forgot-password" className="btn btn--ghost">
            Password reset
          </Link>
        </article>

        <article className="account-section">
          <h2>Orders</h2>
          <p className="account-muted">
            Order history will appear here once checkout is implemented. No
            orders exist in this development storefront.
          </p>
        </article>
      </section>
    </div>
  );
}
