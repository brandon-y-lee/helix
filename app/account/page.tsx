import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AccountDashboardView } from "@/components/account/AccountDashboardView";
import { AccountUnavailable } from "@/components/account/AccountUnavailable";
import { ProfileForm, SignOutButton } from "@/components/account/AccountForms";
import { PrivateFeedbackForm } from "@/components/account/PrivateFeedbackForm";
import { getProfile } from "@/lib/auth/profile";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrdersForCurrentUser } from "@/lib/orders/server";
import { getRewardsSummaryForCurrentUser } from "@/lib/rewards/server";
import {
  isSupabaseNetworkError,
  logSupabaseUnavailable,
} from "@/lib/supabase/network";

export const metadata: Metadata = {
  title: "Account | helix",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const requestHeaders = await headers();
  const requestId = requestHeaders.get("x-request-id");
  const startedAt = Date.now();
  let user;

  try {
    user = await getCurrentUser();
  } catch (error) {
    if (!isSupabaseNetworkError(error)) throw error;
    logSupabaseUnavailable(error, {
      operation: "account.identity",
      route: "/account",
      runtime: "nodejs",
      requestId,
      elapsedMs: Date.now() - startedAt,
    });
    return <AccountUnavailable />;
  }

  if (!user) redirect("/account/sign-in?next=%2Faccount");

  const accountData = await Promise.all([
    getProfile(user),
    getOrdersForCurrentUser(),
    getRewardsSummaryForCurrentUser(),
  ]).catch((error: unknown) => {
    if (!isSupabaseNetworkError(error)) throw error;
    logSupabaseUnavailable(error, {
      operation: "account.dashboard",
      route: "/account",
      runtime: "nodejs",
      requestId,
      elapsedMs: Date.now() - startedAt,
    });
    return null;
  });
  if (!accountData) return <AccountUnavailable />;
  const [profile, orders, rewards] = accountData;
  const verified = Boolean(user.email_confirmed_at);

  return (
    <AccountDashboardView
      email={user.email}
      verified={verified}
      orders={orders}
      rewards={rewards}
      profileForm={
        <ProfileForm
          firstName={profile?.first_name ?? ""}
          lastName={profile?.last_name ?? ""}
        />
      }
      signOutControl={<SignOutButton />}
      renderFeedback={(request) => (
        <PrivateFeedbackForm
          feedbackId={request.id}
          orderNumber={request.order_number}
        />
      )}
    />
  );
}
