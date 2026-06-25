import Stripe from "stripe";
import { resolve } from "node:path";
import { config } from "dotenv";
import {
  CHECKOUT_ENVIRONMENT,
  STRIPE_API_VERSION,
  isLiveStripeSecretKey,
  isTestStripeSecretKey,
} from "../lib/checkout/config";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const REQUIRED_COUPONS = [
  { name: "Mei Pelle Rewards - $5", env: "STRIPE_REWARD_200_COUPON_ID", amountOff: 500 },
  { name: "Mei Pelle Rewards - $10", env: "STRIPE_REWARD_400_COUPON_ID", amountOff: 1000 },
  { name: "Mei Pelle Rewards - $15", env: "STRIPE_REWARD_600_COUPON_ID", amountOff: 1500 },
  { name: "Mei Pelle Referral - 15%", env: "STRIPE_REFERRAL_15_COUPON_ID", percentOff: 15 },
] as const;

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

  for (const coupon of REQUIRED_COUPONS) {
    const configuredId = process.env[coupon.env];
    if (configuredId) {
      const existing = await stripe.coupons.retrieve(configuredId);
      if (existing.deleted || existing.livemode) {
        throw new Error(`${coupon.env} is not a reusable sandbox coupon.`);
      }
      console.log(`${coupon.env}=reused:${existing.id}`);
      continue;
    }

    const created = await stripe.coupons.create({
      name: coupon.name,
      duration: "once",
      currency: "amountOff" in coupon ? "usd" : undefined,
      amount_off: "amountOff" in coupon ? coupon.amountOff : undefined,
      percent_off: "percentOff" in coupon ? coupon.percentOff : undefined,
      metadata: {
        environment: CHECKOUT_ENVIRONMENT,
        managed_by: "pnpm stripe:sync:sandbox",
      },
    });
    if (created.livemode) throw new Error(`Created live coupon unexpectedly: ${coupon.env}`);
    console.log(`${coupon.env}=created:${created.id}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Stripe sandbox sync failed.");
  process.exitCode = 1;
});
