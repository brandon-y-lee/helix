import Stripe from "stripe";
import { access, open } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import {
  STRIPE_API_VERSION,
  isLiveStripeSecretKey,
  isTestStripeSecretKey,
} from "../lib/checkout/config";
import {
  HELIX_SANDBOX_REWARDS_COUPONS,
  assertEquivalentSandboxCoupon,
  managedSandboxCouponIdForDefinition,
  sandboxCouponHasManagedIdentity,
  syncSandboxRewardsCoupon,
} from "./stripe/sandbox-rewards";
import {
  assertNoConflictingEventDestinations,
  assertApprovedStripeSandboxAccount,
  planSandboxWebhookEndpoint,
  syncSandboxWebhookEndpoint,
} from "./stripe/sandbox-webhook";

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

type Mode = "apply" | "plan" | "verify";

function readMode(argv: string[]): Mode {
  const mode = argv.find((value) => !value.startsWith("--")) ?? "apply";
  if (mode === "apply" || mode === "plan" || mode === "verify") return mode;
  throw new Error("Expected Stripe sandbox mode: plan, apply, or verify.");
}

async function assertSecretOutputIsAvailable(path: string): Promise<void> {
  if (!resolve(path).startsWith("/private/tmp/") && !resolve(path).startsWith("/tmp/")) {
    throw new Error("STRIPE_WEBHOOK_SECRET_OUTPUT_FILE must be a temporary absolute path.");
  }
  try {
    await access(path);
  } catch {
    return;
  }
  throw new Error("STRIPE_WEBHOOK_SECRET_OUTPUT_FILE already exists.");
}

async function main() {
  const mode = readMode(process.argv.slice(2));
  const allowWebhookCreate = process.argv.includes("--allow-webhook-create");
  const secretOutputPath = process.env.STRIPE_WEBHOOK_SECRET_OUTPUT_FILE?.trim();
  if (allowWebhookCreate && mode !== "apply") {
    throw new Error("--allow-webhook-create is valid only in apply mode.");
  }
  if (allowWebhookCreate) {
    if (!secretOutputPath) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET_OUTPUT_FILE is required for one-time endpoint creation.",
      );
    }
    await assertSecretOutputIsAvailable(secretOutputPath);
  }

  const stripe = new Stripe(readSecretKey(), {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
  const [account, webhookEndpoints, eventDestinations] = await Promise.all([
    stripe.account.retrieve(null),
    stripe.webhookEndpoints.list({ limit: 100 }),
    stripe.v2.core.eventDestinations.list({
      include: ["webhook_endpoint.url"],
      limit: 100,
    }),
  ]);
  assertApprovedStripeSandboxAccount(account);

  const configuredEndpointId =
    process.env.STRIPE_WEBHOOK_ENDPOINT_ID?.trim() || null;
  assertNoConflictingEventDestinations(
    eventDestinations.data,
    webhookEndpoints.data[0] ?? null,
  );
  if (!allowWebhookCreate && !configuredEndpointId) {
    throw new Error("Set STRIPE_WEBHOOK_ENDPOINT_ID to the approved sandbox endpoint.");
  }
  const webhookPlan = planSandboxWebhookEndpoint(
    webhookEndpoints.data,
    configuredEndpointId,
    allowWebhookCreate,
  );
  if (webhookPlan.action === "blocked") {
    throw new Error("The approved Stripe sandbox webhook endpoint is missing.");
  }

  const inventory: Stripe.Coupon[] = [];
  for await (const coupon of stripe.coupons.list({ limit: 100 })) {
    inventory.push(coupon);
  }

  const coupons = HELIX_SANDBOX_REWARDS_COUPONS.map((definition) => {
    const configuredId = process.env[definition.env]?.trim() || null;
    const couponId =
      configuredId ?? managedSandboxCouponIdForDefinition(inventory, definition);
    if (!couponId) {
      throw new Error(`${definition.env} does not identify an existing sandbox coupon.`);
    }
    const coupon = inventory.find((candidate) => candidate.id === couponId);
    if (!coupon) {
      throw new Error(`${definition.env} is absent from the Stripe sandbox inventory.`);
    }
    assertEquivalentSandboxCoupon(coupon, definition);
    return { coupon, couponId, definition };
  });

  const report = {
    account: {
      id: account.id,
      verified: true,
    },
    coupons: coupons.map(({ coupon, couponId, definition }) => ({
      action: sandboxCouponHasManagedIdentity(coupon, definition)
        ? "unchanged"
        : "update",
      env: definition.env,
      id: couponId,
    })),
    mode,
    webhook: webhookPlan,
  };

  if (mode === "plan") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (mode === "verify") {
    const verified =
      report.coupons.every((coupon) => coupon.action === "unchanged") &&
      webhookPlan.action === "unchanged";
    console.log(JSON.stringify({ ...report, verified }, null, 2));
    if (!verified) process.exitCode = 1;
    return;
  }

  const webhookStatus =
    webhookPlan.action === "unchanged"
      ? {
          endpointId: webhookPlan.endpointId,
          rotatedSecret: null,
          status: "unchanged" as const,
        }
      : await syncSandboxWebhookEndpoint(stripe, webhookPlan);
  if (webhookStatus.rotatedSecret) {
    if (!secretOutputPath) {
      throw new Error("Missing secure output path for the rotated webhook secret.");
    }
    const file = await open(secretOutputPath, "wx", 0o600);
    try {
      await file.writeFile(
        `${webhookStatus.endpointId}\t${webhookStatus.rotatedSecret}\n`,
        "utf8",
      );
    } finally {
      await file.close();
    }
  }

  const couponStatuses = [];
  for (const { couponId, definition } of coupons) {
    const result = await syncSandboxRewardsCoupon(stripe, definition, couponId);
    couponStatuses.push({ env: definition.env, ...result });
  }
  console.log(
    JSON.stringify(
      {
        account: { id: account.id, verified: true },
        coupons: couponStatuses,
        mode,
        webhook: {
          endpointId: webhookStatus.endpointId,
          secretRotated: webhookStatus.rotatedSecret !== null,
          status: webhookStatus.status,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Stripe sandbox sync failed.");
  process.exitCode = 1;
});
