import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountAccessLayout } from "@/components/account/AccountAccessLayout";
import { SignInForm } from "@/components/account/AccountForms";
import { safeReturnTo } from "@/lib/auth/redirect";
import { getCurrentUserForPublicPage } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sign in | Mei Pelle",
};

const LINK_ERRORS: Record<string, string> = {
  "invalid-link": "This sign-in link is invalid. Request a new one and try again.",
  "expired-link": "This sign-in link expired. Request a new one and try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeReturnTo(params.next);
  const user = await getCurrentUserForPublicPage();
  if (user) redirect(next);

  return (
    <AccountAccessLayout heading="Sign in">
      <SignInForm
        next={next}
        error={params.error ? LINK_ERRORS[params.error] : undefined}
      />
    </AccountAccessLayout>
  );
}
