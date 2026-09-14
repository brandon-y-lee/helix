import Stripe from "stripe";
import { resolve } from "node:path";
import { config } from "dotenv";
import { STRIPE_API_VERSION } from "../lib/checkout/config";
import {
  CancellationInventoryError,
  verifyCheckoutCancellationRetirement,
} from "./stripe/checkout-cancellation-inventory";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

async function main() {
  try {
    const report = await verifyCheckoutCancellationRetirement({
      secretKey: process.env.STRIPE_SECRET_KEY,
      createClient: (secretKey) => new Stripe(secretKey, {
        apiVersion: STRIPE_API_VERSION,
        maxNetworkRetries: 0,
        timeout: 15_000,
      }),
    });
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "ready") process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      status: "blocked",
      reason: error instanceof CancellationInventoryError ? error.code : "inventory-read-failed",
    }));
    process.exitCode = 1;
  }
}

void main();
