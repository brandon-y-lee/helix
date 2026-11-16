type ActiveSandboxRewardsCoupon = {
  amount_off: number | null;
  currency: string | null;
  deleted?: false | void;
  duration: string;
  id: string;
  livemode: boolean;
  metadata: Record<string, string> | null;
  name: string | null;
  percent_off: number | null;
  valid: boolean;
};

type SandboxRewardsCoupon =
  | ActiveSandboxRewardsCoupon
  | { deleted: true; id: string };

type SandboxRewardsCouponClient = {
  coupons: {
    create: (
      params: {
        amount_off?: number;
        currency?: "usd";
        duration: "once";
        id: string;
        metadata: Record<string, string>;
        name: string;
        percent_off?: number;
      },
      options: { idempotencyKey: string },
    ) => Promise<SandboxRewardsCoupon>;
    retrieve: (id: string) => Promise<SandboxRewardsCoupon>;
    update: (
      id: string,
      params: { metadata: Record<string, string>; name: string },
    ) => Promise<SandboxRewardsCoupon>;
  };
};

type SandboxRewardsCouponDefinition = {
  amountOff?: number;
  env: string;
  id: string;
  name: string;
  percentOff?: number;
};

export const HELIX_SANDBOX_REWARDS_COUPONS = [
  {
    amountOff: 500,
    env: "STRIPE_REWARD_200_COUPON_ID",
    id: "helix_rewards_200_sandbox",
    name: "helix rewards — $5 off",
  },
  {
    amountOff: 1_000,
    env: "STRIPE_REWARD_400_COUPON_ID",
    id: "helix_rewards_400_sandbox",
    name: "helix rewards — $10 off",
  },
  {
    amountOff: 1_500,
    env: "STRIPE_REWARD_600_COUPON_ID",
    id: "helix_rewards_600_sandbox",
    name: "helix rewards — $15 off",
  },
  {
    env: "STRIPE_REFERRAL_15_COUPON_ID",
    id: "helix_referral_15_sandbox",
    name: "helix referral offer — 15% off",
    percentOff: 15,
  },
] as const satisfies readonly SandboxRewardsCouponDefinition[];

const MANAGED_METADATA = {
  contract: "helix_rewards",
  environment: "sandbox",
  managed_by: "pnpm stripe:sync:sandbox",
} as const;

export function assertEquivalentSandboxCoupon(
  coupon: SandboxRewardsCoupon,
  definition: SandboxRewardsCouponDefinition,
): asserts coupon is ActiveSandboxRewardsCoupon {
  if (coupon.deleted) {
    throw new Error(`${definition.env} is not the expected reusable sandbox coupon.`);
  }

  const amountMatches =
    "amountOff" in definition
      ? coupon.amount_off === definition.amountOff && coupon.currency === "usd"
      : coupon.amount_off === null;
  const percentMatches =
    "percentOff" in definition
      ? coupon.percent_off === definition.percentOff
      : coupon.percent_off === null;

  if (
    coupon.livemode ||
    !coupon.valid ||
    coupon.duration !== "once" ||
    !amountMatches ||
    !percentMatches
  ) {
    throw new Error(`${definition.env} is not the expected reusable sandbox coupon.`);
  }
}

function isEquivalentManagedSandboxCoupon(
  coupon: SandboxRewardsCoupon,
  definition: SandboxRewardsCouponDefinition,
): coupon is ActiveSandboxRewardsCoupon {
  try {
    assertEquivalentSandboxCoupon(coupon, definition);
  } catch {
    return false;
  }
  return (
    coupon.metadata?.environment === "sandbox" &&
    coupon.metadata.managed_by === MANAGED_METADATA.managed_by
  );
}

export function managedSandboxCouponIdForDefinition(
  coupons: readonly SandboxRewardsCoupon[],
  definition: SandboxRewardsCouponDefinition,
): string | null {
  const matches = coupons.filter((coupon) =>
    isEquivalentManagedSandboxCoupon(coupon, definition),
  );
  if (matches.length > 1) {
    throw new Error(`${definition.env} has multiple matching managed sandbox coupons.`);
  }
  return matches[0]?.id ?? null;
}

export function sandboxCouponHasManagedIdentity(
  coupon: ActiveSandboxRewardsCoupon,
  definition: SandboxRewardsCouponDefinition,
): boolean {
  return (
    coupon.name === definition.name &&
    Object.entries(MANAGED_METADATA).every(
      ([key, value]) => coupon.metadata?.[key] === value,
    )
  );
}

function assertManagedIdentity(
  coupon: ActiveSandboxRewardsCoupon,
  definition: SandboxRewardsCouponDefinition,
): void {
  if (!sandboxCouponHasManagedIdentity(coupon, definition)) {
    throw new Error(`${definition.env} did not apply the helix rewards identity.`);
  }
}

export async function syncSandboxRewardsCoupon(
  stripe: SandboxRewardsCouponClient,
  definition: SandboxRewardsCouponDefinition,
  couponId: string | null,
): Promise<{ id: string; status: "created" | "reused" | "updated" }> {
  const targetId = couponId ?? definition.id;
  let coupon: SandboxRewardsCoupon;
  try {
    coupon = await stripe.coupons.retrieve(targetId);
  } catch (error) {
    const resourceIsMissing =
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "resource_missing";
    if (couponId || !resourceIsMissing) throw error;

    const created = await stripe.coupons.create(
      {
        id: definition.id,
        name: definition.name,
        duration: "once",
        ...(definition.amountOff === undefined
          ? { percent_off: definition.percentOff }
          : { amount_off: definition.amountOff, currency: "usd" as const }),
        metadata: MANAGED_METADATA,
      },
      { idempotencyKey: `helix-rewards-coupon:${definition.id}` },
    );
    assertEquivalentSandboxCoupon(created, definition);
    assertManagedIdentity(created, definition);
    return { id: created.id, status: "created" };
  }
  assertEquivalentSandboxCoupon(coupon, definition);

  if (sandboxCouponHasManagedIdentity(coupon, definition)) {
    return { id: coupon.id, status: "reused" };
  }

  const updated = await stripe.coupons.update(coupon.id, {
    name: definition.name,
    metadata: MANAGED_METADATA,
  });
  assertEquivalentSandboxCoupon(updated, definition);
  assertManagedIdentity(updated, definition);
  return { id: updated.id, status: "updated" };
}
