"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCartMutations } from "@/components/cart/useCart";
import { cartErrorMessage } from "@/lib/cart/client";
import { formatPrice } from "@/lib/products";

type RewardTierSummary = {
  id: string;
  points: number;
  discountCents: number;
  label: string;
};

type RewardsSummaryResponse = {
  authenticated?: boolean;
  emailConfirmed?: boolean;
  pointsBalance?: number;
  estimatedPurchasePoints?: number;
  affordableTiers?: RewardTierSummary[];
};

function isRewardTier(value: unknown): value is RewardTierSummary {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as RewardTierSummary).id === "string" &&
    typeof (value as RewardTierSummary).points === "number" &&
    typeof (value as RewardTierSummary).discountCents === "number" &&
    typeof (value as RewardTierSummary).label === "string"
  );
}

export function CheckoutPanel({
  disabled,
  subtotal,
}: {
  disabled: boolean;
  subtotal: number;
}) {
  const [rewardSummary, setRewardSummary] = useState<RewardsSummaryResponse | null>(null);
  const [rewardsStatus, setRewardsStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [selectedReward, setSelectedReward] = useState("none");
  const {
    checkoutPending: pending,
    checkoutError,
    resetErrors,
    startCheckout: createCheckout,
  } = useCartMutations();
  const tiers = useMemo(
    () => (rewardSummary?.affordableTiers ?? []).filter(isRewardTier),
    [rewardSummary],
  );

  useEffect(() => {
    let active = true;
    setRewardsStatus("loading");
    fetch("/api/rewards/summary", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("rewards unavailable");
        return response.json();
      })
      .then((data: RewardsSummaryResponse) => {
        if (active) {
          setRewardSummary(data);
          setRewardsStatus("ready");
        }
      })
      .catch(() => {
        if (active) {
          setRewardSummary(null);
          setRewardsStatus("unavailable");
        }
      });

    return () => {
      active = false;
    };
  }, [subtotal]);

  async function startCheckout() {
    if (pending || disabled) return;
    resetErrors();
    const session = await createCheckout(
      selectedReward === "none" ? null : selectedReward,
    );
    if (session) window.location.assign(session.url);
  }

  return (
    <div className="checkout-panel" aria-label="Sandbox checkout">
      <div className="checkout-panel__rewards">
        {rewardsStatus === "loading" ? (
          <p className="checkout-panel__hint">Loading helix rewards.</p>
        ) : rewardsStatus === "unavailable" ? (
          <p className="checkout-panel__hint" role="status">
            helix rewards is temporarily unavailable.
          </p>
        ) : rewardSummary?.authenticated ? (
          <>
            <div className="summary-row">
              <span>Estimated Points Award</span>
              <span>{rewardSummary.estimatedPurchasePoints ?? 0}</span>
            </div>
            <div className="summary-row">
              <span>Available Points Balance</span>
              <span>{rewardSummary.pointsBalance ?? 0}</span>
            </div>
            <fieldset className="reward-selector">
              <legend>Choose one Redemption Tier</legend>
              <label>
                <input
                  type="radio"
                  name="rewardTier"
                  value="none"
                  checked={selectedReward === "none"}
                  onChange={() => setSelectedReward("none")}
                />
                No Redemption Tier
              </label>
              {tiers.map((tier) => (
                <label key={tier.id}>
                  <input
                    type="radio"
                    name="rewardTier"
                    value={tier.id}
                    checked={selectedReward === tier.id}
                    onChange={() => setSelectedReward(tier.id)}
                  />
                  {tier.label} ({tier.points} Points)
                </label>
              ))}
              {tiers.length === 0 && (
                <p className="checkout-panel__hint">
                  No Redemption Tier is available for this Cart yet.
                </p>
              )}
            </fieldset>
          </>
        ) : (
          <p className="checkout-panel__hint">
            An account is required to earn and redeem Points. Guest sandbox
            checkout is still available.
            {" "}
            <Link href="/account/sign-in?next=%2Fcart">Sign in</Link>
          </p>
        )}
      </div>

      {checkoutError && (
        <p className="form-status form-status--error" role="status">
          {cartErrorMessage(
            checkoutError,
            "Sandbox checkout is temporarily unavailable.",
          )}
        </p>
      )}

      <button
        type="button"
        className="btn btn--editorial-rounded"
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        onClick={() => void startCheckout()}
      >
        {pending ? "Opening sandbox checkout" : `Sandbox checkout ${formatPrice(subtotal)}`}
      </button>
    </div>
  );
}
