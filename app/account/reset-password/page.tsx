import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/account/AccountForms";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Set new password | Mei Pelle",
};

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  return (
    <div className="container account-shell">
      <section className="account-panel">
        <p className="eyebrow">Account</p>
        <h1>Set new password</h1>
        {user ? (
          <ResetPasswordForm />
        ) : (
          <div className="empty-state">
            <p>This password reset link is expired or invalid.</p>
            <Link href="/account/forgot-password" className="btn">
              Request a new link
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
