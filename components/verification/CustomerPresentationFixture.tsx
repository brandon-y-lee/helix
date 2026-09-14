"use client";

import { AccountAccessLayout } from "@/components/account/AccountAccessLayout";
import { AccountDashboardView } from "@/components/account/AccountDashboardView";
import { AccountUnavailable } from "@/components/account/AccountUnavailable";
import { ForgotPasswordForm, ProfileForm, ResetPasswordForm, SignInForm, SignUpForm, type AccountFormAction } from "@/components/account/AccountForms";
import { PrivateFeedbackForm } from "@/components/account/PrivateFeedbackForm";
import { RewardsView } from "@/components/account/RewardsView";
import { OrderConfirmationView } from "@/components/cart/OrderConfirmationView";
import { customerOrderConfirmationFixture, customerOrdersFixture, customerRewardsFixture, type CustomerFixtureForm, type CustomerFixtureState, type CustomerFixtureView } from "@/app/helix-verification/customer/presentation";

export function CustomerPresentationFixture({ view, state, form }: {
  view: CustomerFixtureView;
  state: CustomerFixtureState;
  form: CustomerFixtureForm;
}) {
  const action: AccountFormAction = async () => {
    if (state === "pending") return new Promise(() => {});
    if (state === "validation") return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: { email: "Enter a valid email address.", password: "Use at least 8 characters.", confirmPassword: "Passwords must match." },
    };
    if (state === "error") return { status: "error", message: "Account services are temporarily unavailable. Try again." };
    if (view === "auth" && form === "sign-in") return { status: "idle" };
    const messages = {
      "sign-in": "",
      "sign-up": "Check your email to verify the account, then return to sign in.",
      "forgot-password": "If an account exists for that email, password reset instructions will arrive shortly.",
      "reset-password": "Password updated.",
    };
    return { status: "success", message: view === "account" ? "Profile updated." : messages[form] };
  };

  async function submitFeedback() {
    if (state === "pending") return new Promise<void>(() => {});
    if (state === "error") throw new Error("Private feedback could not be submitted.");
  }

  function renderFeedback(request: { id: string; order_number: string }) {
    return <PrivateFeedbackForm feedbackId={request.id} orderNumber={request.order_number} submitFeedback={submitFeedback} />;
  }

  if (view === "order") return <OrderConfirmationView confirmation={customerOrderConfirmationFixture(state)} />;
  if (view === "rewards") return <RewardsView rewards={customerRewardsFixture(state)} renderFeedback={renderFeedback} />;
  if (view === "account") {
    if (state === "unavailable") return <AccountUnavailable />;
    return <AccountDashboardView
      email="sample@example.test"
      verified={state !== "unverified"}
      orders={customerOrdersFixture(state)}
      rewards={customerRewardsFixture(state)}
      profileForm={<ProfileForm firstName="Sample" lastName="Account" action={action} />}
      signOutControl={<button type="button" className="btn btn--ghost btn--sm btn--editorial-rounded account-signout">Sign out</button>}
      renderFeedback={renderFeedback}
    />;
  }
  if (form === "reset-password") {
    return <div className="container account-shell account-status-page"><section className="account-panel">
      <p className="eyebrow">Account</p><h1>Set new password</h1><ResetPasswordForm action={action} />
    </section></div>;
  }
  const heading = form === "sign-in" ? "Sign in" : form === "sign-up" ? "Create Account" : "Reset password";
  return <AccountAccessLayout heading={heading} keepHeadingOnOneLine={form === "sign-up"}>
    {form === "sign-in" ? <SignInForm next="/account" action={action} /> : form === "sign-up" ? <SignUpForm action={action} /> : <ForgotPasswordForm action={action} />}
  </AccountAccessLayout>;
}
