import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountAccessLayout } from "@/components/account/AccountAccessLayout";
import { SignUpForm } from "@/components/account/AccountForms";
import { getCurrentUserForPublicPage } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Create account | Mei Pelle",
};

export default async function SignUpPage() {
  const user = await getCurrentUserForPublicPage();
  if (user) redirect("/account");

  return (
    <AccountAccessLayout heading="Create account">
      <SignUpForm />
    </AccountAccessLayout>
  );
}
