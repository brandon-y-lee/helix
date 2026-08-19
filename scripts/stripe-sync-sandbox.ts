import Stripe from "stripe";
import { resolve } from "node:path";
import { config } from "dotenv";
import {
  STRIPE_API_VERSION,
  isLiveStripeSecretKey,
  isTestStripeSecretKey,
} from "../lib/checkout/config";
import {
  HELIX_SANDBOX_REWARDS_COUPONS,
  managedSandboxCouponIdForDefinition,
  syncSandboxRewardsCoupon,
} from "./stripe/sandbox-rewards";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

function readSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (isLiveStripeSecretKey(key)) {
    throw new Error("Refusing to sync Stripe resources with a live secret key.");
  }
  if (!key || !isTestStripeSecretKey(key)) {
    throw new Error("Set STRIPE_SECRET_KEY to a Stripe sandbox/test secret key.");
  }
  return key;
}

async function main() {
  const stripe = new Stripe(readSecretKey(), {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
  const inventory = [];
  for await (const coupon of stripe.coupons.list({ limit: 100 })) {
    inventory.push(coupon);
  }

  for (const coupon of HELIX_SANDBOX_REWARDS_COUPONS) {
    const configuredId = process.env[coupon.env]?.trim() || null;
    const couponId =
      configuredId ?? managedSandboxCouponIdForDefinition(inventory, coupon);
    const result = await syncSandboxRewardsCoupon(stripe, coupon, couponId);
    console.log(`${coupon.env}=${result.status}:${result.id}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Stripe sandbox sync failed.");
  process.exitCode = 1;
});
