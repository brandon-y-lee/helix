import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/account/AccountForms";
import { getCurrentUserForPublicPage } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Set new password | helix",
};

export default async function ResetPasswordPage() {
  const user = await getCurrentUserForPublicPage();

  return (
    <div className="container account-shell account-status-page">
      <section className="account-panel">
        <p className="eyebrow">Account</p>
        <h1>Set new password</h1>
        {user ? (
          <ResetPasswordForm />
        ) : (
          <div className="empty-state">
            <p>This password reset link is expired or invalid.</p>
            <Link href="/account/forgot-password" className="btn btn--editorial-rounded">
              Request a new link
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
