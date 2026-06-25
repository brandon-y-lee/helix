export const MEI_PELLE_REWARDS_NAME = "MEI PELLE REWARDS";
export const WELCOME_REWARD_POINTS = 100;
export const PRIVATE_FEEDBACK_POINTS = 300;
export const PURCHASE_POINTS_PER_DOLLAR = 2;
export const REFERRAL_MINIMUM_SUBTOTAL_CENTS = 5000;
export const REFERRAL_DISCOUNT_PERCENT = 15;

export type RewardTierId = "points_200" | "points_400" | "points_600";

export type RewardTier = {
  id: RewardTierId;
  points: number;
  discountCents: number;
  label: string;
};

export const REWARD_TIERS: RewardTier[] = [
  { id: "points_200", points: 200, discountCents: 500, label: "$5 off" },
  { id: "points_400", points: 400, discountCents: 1000, label: "$10 off" },
  { id: "points_600", points: 600, discountCents: 1500, label: "$15 off" },
];

export function calculatePurchasePoints(eligibleNetMerchandiseCents: unknown): number {
  if (
    typeof eligibleNetMerchandiseCents !== "number" ||
    !Number.isFinite(eligibleNetMerchandiseCents) ||
    eligibleNetMerchandiseCents <= 0
  ) {
    return 0;
  }

  return Math.floor((Math.trunc(eligibleNetMerchandiseCents) * PURCHASE_POINTS_PER_DOLLAR) / 100);
}

export function rewardTierById(value: unknown): RewardTier | null {
  if (typeof value !== "string") return null;
  return REWARD_TIERS.find((tier) => tier.id === value) ?? null;
}

export function affordableRewardTiers(pointsBalance: unknown, merchandiseSubtotalCents: unknown): RewardTier[] {
  const balance =
    typeof pointsBalance === "number" && Number.isFinite(pointsBalance)
      ? Math.max(0, Math.trunc(pointsBalance))
      : 0;
  const subtotal =
    typeof merchandiseSubtotalCents === "number" && Number.isFinite(merchandiseSubtotalCents)
      ? Math.max(0, Math.trunc(merchandiseSubtotalCents))
      : 0;

  return REWARD_TIERS.filter(
    (tier) => balance >= tier.points && subtotal >= tier.discountCents,
  );
}

export function rewardDiscountForTier(
  tier: RewardTier | null,
  merchandiseSubtotalCents: number,
): number {
  if (!tier || merchandiseSubtotalCents <= 0) return 0;
  return Math.min(tier.discountCents, Math.max(0, Math.trunc(merchandiseSubtotalCents)));
}

export function calculateReferralDiscount(merchandiseSubtotalCents: unknown): number {
  if (
    typeof merchandiseSubtotalCents !== "number" ||
    !Number.isFinite(merchandiseSubtotalCents) ||
    merchandiseSubtotalCents < REFERRAL_MINIMUM_SUBTOTAL_CENTS
  ) {
    return 0;
  }

  return Math.floor((Math.trunc(merchandiseSubtotalCents) * REFERRAL_DISCOUNT_PERCENT) / 100);
}

export function isReferralSubtotalEligible(merchandiseSubtotalCents: unknown): boolean {
  return (
    typeof merchandiseSubtotalCents === "number" &&
    Number.isFinite(merchandiseSubtotalCents) &&
    merchandiseSubtotalCents >= REFERRAL_MINIMUM_SUBTOTAL_CENTS
  );
}
