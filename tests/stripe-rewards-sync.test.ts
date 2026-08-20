import { describe, expect, it, vi } from "vitest";
import {
  HELIX_SANDBOX_REWARDS_COUPONS,
  managedSandboxCouponIdForDefinition,
  syncSandboxRewardsCoupon,
} from "@/scripts/stripe/sandbox-rewards";
import { FORMER_BRAND_NAME } from "@/tests/helpers/former-identifiers";

const formerRewardsCouponName = `${FORMER_BRAND_NAME} Rewards - $5`;

describe("Stripe sandbox rewards sync", () => {
  it("discovers an existing managed coupon by its preserved economics", () => {
    const definition = HELIX_SANDBOX_REWARDS_COUPONS[0];

    expect(
      managedSandboxCouponIdForDefinition(
        [
          {
            amount_off: 500,
            currency: "usd",
            duration: "once",
            id: "existing-coupon-200",
            livemode: false,
            metadata: {
              environment: "sandbox",
              managed_by: "pnpm stripe:sync:sandbox",
            },
            name: formerRewardsCouponName,
            percent_off: null,
            valid: true,
          },
        ],
        definition,
      ),
    ).toBe("existing-coupon-200");
  });

  it("renames a configured coupon in place without changing its economics", async () => {
    const coupon = {
      amount_off: 500,
      currency: "usd",
      deleted: false,
      duration: "once",
      id: "coupon-200",
      livemode: false,
      metadata: { environment: "sandbox" },
      name: formerRewardsCouponName,
      percent_off: null,
      valid: true,
    };
    const retrieve = vi.fn().mockResolvedValue(coupon);
    const update = vi.fn().mockResolvedValue({
      ...coupon,
      metadata: {
        contract: "helix_rewards",
        environment: "sandbox",
        managed_by: "pnpm stripe:sync:sandbox",
      },
      name: "helix rewards — $5 off",
    });
    const create = vi.fn();

    await expect(
      syncSandboxRewardsCoupon(
        { coupons: { create, retrieve, update } },
        HELIX_SANDBOX_REWARDS_COUPONS[0],
        coupon.id,
      ),
    ).resolves.toEqual({ id: coupon.id, status: "updated" });

    expect(update).toHaveBeenCalledWith(coupon.id, {
      metadata: {
        contract: "helix_rewards",
        environment: "sandbox",
        managed_by: "pnpm stripe:sync:sandbox",
      },
      name: "helix rewards — $5 off",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a missing coupon under a deterministic retry-safe id", async () => {
    const definition = HELIX_SANDBOX_REWARDS_COUPONS[0];
    const retrieve = vi.fn().mockRejectedValue({ code: "resource_missing" });
    const update = vi.fn();
    const create = vi.fn().mockResolvedValue({
      amount_off: 500,
      currency: "usd",
      duration: "once",
      id: definition.id,
      livemode: false,
      metadata: {
        contract: "helix_rewards",
        environment: "sandbox",
        managed_by: "pnpm stripe:sync:sandbox",
      },
      name: definition.name,
      percent_off: null,
      valid: true,
    });

    await expect(
      syncSandboxRewardsCoupon(
        { coupons: { create, retrieve, update } },
        definition,
        null,
      ),
    ).resolves.toEqual({ id: definition.id, status: "created" });

    expect(retrieve).toHaveBeenCalledWith(definition.id);
    expect(create).toHaveBeenCalledWith(
      {
        amount_off: 500,
        currency: "usd",
        duration: "once",
        id: definition.id,
        metadata: {
          contract: "helix_rewards",
          environment: "sandbox",
          managed_by: "pnpm stripe:sync:sandbox",
        },
        name: definition.name,
      },
      { idempotencyKey: `helix-rewards-coupon:${definition.id}` },
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("fails closed when Stripe returns a live object from an update", async () => {
    const definition = HELIX_SANDBOX_REWARDS_COUPONS[0];
    const coupon = {
      amount_off: 500,
      currency: "usd",
      duration: "once",
      id: "coupon-200",
      livemode: false,
      metadata: {},
      name: "old name",
      percent_off: null,
      valid: true,
    };
    const retrieve = vi.fn().mockResolvedValue(coupon);
    const update = vi.fn().mockResolvedValue({
      ...coupon,
      livemode: true,
      name: definition.name,
    });

    await expect(
      syncSandboxRewardsCoupon(
        { coupons: { create: vi.fn(), retrieve, update } },
        definition,
        coupon.id,
      ),
    ).rejects.toThrow("not the expected reusable sandbox coupon");
  });

  it("fails when Stripe does not apply the managed helix identity", async () => {
    const definition = HELIX_SANDBOX_REWARDS_COUPONS[0];
    const coupon = {
      amount_off: 500,
      currency: "usd",
      duration: "once",
      id: "coupon-200",
      livemode: false,
      metadata: {},
      name: "old name",
      percent_off: null,
      valid: true,
    };

    await expect(
      syncSandboxRewardsCoupon(
        {
          coupons: {
            create: vi.fn(),
            retrieve: vi.fn().mockResolvedValue(coupon),
            update: vi.fn().mockResolvedValue(coupon),
          },
        },
        definition,
        coupon.id,
      ),
    ).rejects.toThrow("did not apply the helix rewards identity");
  });
});
