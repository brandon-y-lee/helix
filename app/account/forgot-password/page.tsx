import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AccountAccessLayout } from "@/components/account/AccountAccessLayout";
import { ForgotPasswordForm } from "@/components/account/AccountForms";
import { accountEmailLinkOrigin, accountEmailUnavailable } from "@/lib/auth/email-confirmation";

export const metadata: Metadata = {
  title: "Reset password | helix",
};

export default async function ForgotPasswordPage() {
  const emailOrigin = accountEmailLinkOrigin(await headers(), "page");
  return (
    <AccountAccessLayout heading="Reset password">
      {emailOrigin ? <ForgotPasswordForm /> : (
        <p className="account-panel__note">{accountEmailUnavailable.recovery}</p>
      )}
      <p className="account-panel__note">
        <Link href="/account/sign-in">Return to sign in</Link>
      </p>
    </AccountAccessLayout>
  );
}
