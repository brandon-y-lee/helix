import type { Metadata } from "next";
import Link from "next/link";
import { AccountAccessLayout } from "@/components/account/AccountAccessLayout";
import { ForgotPasswordForm } from "@/components/account/AccountForms";

export const metadata: Metadata = {
  title: "Reset password | Mei Pelle",
};

export default function ForgotPasswordPage() {
  return (
    <AccountAccessLayout heading="Reset password">
      <ForgotPasswordForm />
      <p className="account-panel__note">
        <Link href="/account/sign-in">Return to sign in</Link>
      </p>
    </AccountAccessLayout>
  );
}
