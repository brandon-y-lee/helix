import { STRIPE_API_VERSION } from "../../lib/checkout/config";

export const APPROVED_STRIPE_SANDBOX_ACCOUNT_ID =
  "acct_1Tm9WRFEzyaKzdmq" as const;
export const HELIX_STRIPE_WEBHOOK_URL =
  "https://helixskin.vercel.app/api/webhooks/stripe" as const;
export const HELIX_STRIPE_WEBHOOK_EVENTS = [
  "charge.refunded",
  "checkout.session.async_payment_failed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.completed",
  "checkout.session.expired",
] as const;
type HelixStripeWebhookEvent = (typeof HELIX_STRIPE_WEBHOOK_EVENTS)[number];

const HELIX_STRIPE_WEBHOOK_DESCRIPTION = "helix Sandbox Checkout" as const;
const HELIX_STRIPE_WEBHOOK_METADATA = {
  contract: "helix_checkout",
  environment: "sandbox",
  managed_by: "pnpm stripe:sync:sandbox",
} as const;

type SandboxStripeAccount = {
  id: string;
};

type SandboxWebhookEndpoint = {
  api_version: string | null;
  description: string | null;
  enabled_events: string[];
  id: string;
  livemode: boolean;
  metadata: Record<string, string>;
  secret?: string;
  status: string;
  url: string;
};

type SandboxEventDestination = {
  enabled_events?: string[];
  events_from?: string[];
  id: string;
  status: string;
  type: string;
  webhook_endpoint?: { url?: string | null } | null;
};

type SandboxWebhookClient = {
  webhookEndpoints: {
    create: (
      params: {
        api_version: typeof STRIPE_API_VERSION;
        connect: false;
        description: string;
        enabled_events: HelixStripeWebhookEvent[];
        metadata: Record<string, string>;
        url: string;
      },
      options: { idempotencyKey: string },
    ) => Promise<SandboxWebhookEndpoint>;
    update: (
      id: string,
      params: {
        description: string;
        disabled: false;
        enabled_events: HelixStripeWebhookEvent[];
        metadata: Record<string, string>;
        url: string;
      },
    ) => Promise<SandboxWebhookEndpoint>;
  };
};

export type SandboxWebhookPlan =
  | { action: "blocked"; reason: "missing" }
  | { action: "create" }
  | { action: "unchanged"; endpointId: string }
  | { action: "update"; endpointId: string };

export function assertApprovedStripeSandboxAccount(
  account: SandboxStripeAccount,
): void {
  if (account.id !== APPROVED_STRIPE_SANDBOX_ACCOUNT_ID) {
    throw new Error("Refusing to modify an unapproved Stripe sandbox account.");
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    [...left].sort().join("\n") === [...right].sort().join("\n")
  );
}

function sameEvents(events: readonly string[]): boolean {
  return sameStringSet(events, HELIX_STRIPE_WEBHOOK_EVENTS);
}

export function assertNoConflictingEventDestinations(
  destinations: readonly SandboxEventDestination[],
  endpoint: SandboxWebhookEndpoint | null,
): void {
  if (destinations.length === 0) return;
  const destination = destinations[0];
  const isCurrentEndpointMirror =
    destinations.length === 1 &&
    endpoint !== null &&
    destination.id === endpoint.id &&
    destination.type === "webhook_endpoint" &&
    destination.status === endpoint.status &&
    destination.events_from?.length === 1 &&
    destination.events_from[0] === "@self" &&
    Array.isArray(destination.enabled_events) &&
    sameStringSet(destination.enabled_events, endpoint.enabled_events) &&
    destination.webhook_endpoint?.url === endpoint.url;
  if (!isCurrentEndpointMirror) {
    throw new Error(
      "Stripe v2 Event Destinations require manual reconciliation before mutation.",
    );
  }
}

function endpointHasHelixContract(endpoint: SandboxWebhookEndpoint): boolean {
  return (
    endpoint.url === HELIX_STRIPE_WEBHOOK_URL &&
    endpoint.status === "enabled" &&
    endpoint.description === HELIX_STRIPE_WEBHOOK_DESCRIPTION &&
    sameEvents(endpoint.enabled_events) &&
    Object.entries(HELIX_STRIPE_WEBHOOK_METADATA).every(
      ([key, value]) => endpoint.metadata[key] === value,
    )
  );
}

function assertSandboxWebhookEndpoint(endpoint: SandboxWebhookEndpoint): void {
  if (endpoint.livemode) {
    throw new Error("Refusing a live Stripe webhook endpoint.");
  }
  if (endpoint.api_version !== STRIPE_API_VERSION) {
    throw new Error(
      `Stripe webhook API version ${endpoint.api_version ?? "default"} does not match ${STRIPE_API_VERSION}; correcting it would require a deliberate secret rotation.`,
    );
  }
}

function assertAppliedWebhookContract(endpoint: SandboxWebhookEndpoint): void {
  assertSandboxWebhookEndpoint(endpoint);
  if (!endpointHasHelixContract(endpoint)) {
    throw new Error("Stripe did not apply the helix sandbox webhook contract.");
  }
}

export function planSandboxWebhookEndpoint(
  endpoints: readonly SandboxWebhookEndpoint[],
  configuredEndpointId: string | null,
  allowCreate: boolean,
): SandboxWebhookPlan {
  if (endpoints.length > 1) {
    throw new Error("Multiple Stripe webhook endpoints require manual reconciliation.");
  }
  const endpoint = endpoints[0];
  if (!endpoint) {
    if (configuredEndpointId) {
      throw new Error("The configured Stripe webhook endpoint does not exist.");
    }
    return allowCreate
      ? { action: "create" }
      : { action: "blocked", reason: "missing" };
  }

  assertSandboxWebhookEndpoint(endpoint);
  if (!configuredEndpointId) {
    throw new Error(
      "An existing Stripe webhook endpoint must match the configured endpoint ID.",
    );
  }
  if (endpoint.id !== configuredEndpointId) {
    throw new Error("The configured Stripe webhook endpoint does not match inventory.");
  }
  return endpointHasHelixContract(endpoint)
    ? { action: "unchanged", endpointId: endpoint.id }
    : { action: "update", endpointId: endpoint.id };
}

function desiredMutableWebhookFields() {
  return {
    description: HELIX_STRIPE_WEBHOOK_DESCRIPTION,
    enabled_events: [...HELIX_STRIPE_WEBHOOK_EVENTS],
    metadata: { ...HELIX_STRIPE_WEBHOOK_METADATA },
    url: HELIX_STRIPE_WEBHOOK_URL,
  };
}

export async function syncSandboxWebhookEndpoint(
  stripe: SandboxWebhookClient,
  plan: Exclude<SandboxWebhookPlan, { action: "blocked" | "unchanged" }>,
): Promise<{
  endpointId: string;
  rotatedSecret: string | null;
  status: "created" | "updated";
}> {
  if (plan.action === "create") {
    const endpoint = await stripe.webhookEndpoints.create(
      {
        ...desiredMutableWebhookFields(),
        api_version: STRIPE_API_VERSION,
        connect: false,
      },
      { idempotencyKey: "helix-sandbox-webhook:helixskin.vercel.app" },
    );
    assertAppliedWebhookContract(endpoint);
    if (!endpoint.secret?.startsWith("whsec_")) {
      throw new Error("Stripe did not return the new webhook signing secret.");
    }
    return {
      endpointId: endpoint.id,
      rotatedSecret: endpoint.secret,
      status: "created",
    };
  }

  const endpoint = await stripe.webhookEndpoints.update(plan.endpointId, {
    ...desiredMutableWebhookFields(),
    disabled: false,
  });
  assertAppliedWebhookContract(endpoint);
  if (endpoint.id !== plan.endpointId) {
    throw new Error("Stripe changed the webhook endpoint identity unexpectedly.");
  }
  return {
    endpointId: endpoint.id,
    rotatedSecret: null,
    status: "updated",
  };
}
