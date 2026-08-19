import { describe, expect, it } from "vitest";
import {
  REWARD_TIERS,
  affordableRewardTiers,
  calculatePurchasePoints,
  calculateReferralDiscount,
  isReferralSubtotalEligible,
  pointsLedgerEntryLabel,
  rewardDiscountForTier,
  rewardTierById,
} from "@/lib/rewards/rules";
import { qualifiesForFreeStandardShipping } from "@/content/support/policy";

describe("rewards rules", () => {
  it("calculates purchase points as 2 points per eligible dollar", () => {
    expect(calculatePurchasePoints(0)).toBe(0);
    expect(calculatePurchasePoints(4999)).toBe(99);
    expect(calculatePurchasePoints(5000)).toBe(100);
    expect(calculatePurchasePoints(5050)).toBe(101);
    expect(calculatePurchasePoints(Number.NaN)).toBe(0);
  });

  it("uses exact redemption tiers and no unaffordable tiers", () => {
    expect(REWARD_TIERS).toEqual([
      { id: "points_200", points: 200, discountCents: 500, label: "$5 off" },
      { id: "points_400", points: 400, discountCents: 1000, label: "$10 off" },
      { id: "points_600", points: 600, discountCents: 1500, label: "$15 off" },
    ]);
    expect(affordableRewardTiers(399, 2000).map((tier) => tier.id)).toEqual(["points_200"]);
    expect(affordableRewardTiers(600, 1000).map((tier) => tier.id)).toEqual([
      "points_200",
      "points_400",
    ]);
  });

  it("does not let a reward exceed merchandise subtotal", () => {
    expect(rewardDiscountForTier(rewardTierById("points_600"), 1200)).toBe(1200);
    expect(rewardDiscountForTier(null, 1200)).toBe(0);
  });

  it("calculates referral eligibility and free shipping after discounts", () => {
    expect(isReferralSubtotalEligible(4999)).toBe(false);
    expect(isReferralSubtotalEligible(5000)).toBe(true);
    expect(calculateReferralDiscount(5000)).toBe(750);
    expect(qualifiesForFreeStandardShipping(5000 - 750)).toBe(false);
  });

  it.each([
    ["welcome", "Points Award"],
    ["redemption_reserved", "Points Reservation"],
    ["redemption_captured", "Points Redemption"],
    ["redemption_released", "Points Release"],
    ["redemption_reversal", "Points Reversal"],
    ["referral_entitlement_issued", "Referral Reward"],
  ])("labels %s history as %s", (entryType, label) => {
    expect(pointsLedgerEntryLabel(entryType)).toBe(label);
  });
});
