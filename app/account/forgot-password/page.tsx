import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/account/AccountForms";

export const metadata: Metadata = {
  title: "Reset password | Mei Pelle",
};

export default function ForgotPasswordPage() {
  return (
    <div className="container account-shell">
      <section className="account-panel">
        <p className="eyebrow">Account</p>
        <h1>Reset password</h1>
        <ForgotPasswordForm />
        <p className="account-panel__note">
          <Link href="/account/sign-in">Return to sign in</Link>
        </p>
      </section>
    </div>
  );
}
