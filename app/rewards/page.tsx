import type { Metadata } from "next";
import { PrivateFeedbackForm } from "@/components/account/PrivateFeedbackForm";
import { RewardsView } from "@/components/account/RewardsView";
import { getRewardsSummaryForCurrentUser } from "@/lib/rewards/server";

export const metadata: Metadata = {
  title: "helix rewards | helix",
  description:
    "helix rewards Points, redemptions, referrals, and private post-purchase feedback.",
};

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const rewards = await getRewardsSummaryForCurrentUser().catch(() => null);

  return (
    <RewardsView
      rewards={rewards}
      renderFeedback={(request) => (
        <PrivateFeedbackForm
          feedbackId={request.id}
          orderNumber={request.order_number}
        />
      )}
    />
  );
}
