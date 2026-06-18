import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/account/AccountForms";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Create account | Mei Pelle",
};

export default async function SignUpPage() {
  const user = await getCurrentUser();
  if (user) redirect("/account");

  return (
    <div className="container account-shell">
      <section className="account-panel">
        <p className="eyebrow">Account</p>
        <h1>Create account</h1>
        <SignUpForm />
      </section>
    </div>
  );
}
