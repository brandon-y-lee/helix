import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountAccessLayout } from "@/components/account/AccountAccessLayout";
import { SignUpForm } from "@/components/account/AccountForms";
import { accountEmailLinkOrigin, accountEmailUnavailable } from "@/lib/auth/email-confirmation";
import { getCurrentUserForPublicPage } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Create account | helix",
};

export default async function SignUpPage() {
  const user = await getCurrentUserForPublicPage();
  if (user) redirect("/account");
  const emailOrigin = accountEmailLinkOrigin(await headers(), "page");

  return (
    <AccountAccessLayout heading="Create Account" keepHeadingOnOneLine>
      {emailOrigin ? <SignUpForm /> : (
        <>
          <p className="account-panel__note">{accountEmailUnavailable.signup}</p>
          <p className="account-panel__note"><Link href="/account/sign-in">Return to sign in</Link></p>
        </>
      )}
    </AccountAccessLayout>
  );
}
