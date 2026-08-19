import { describe, expect, it, vi } from "vitest";
import {
  APPROVED_STRIPE_SANDBOX_ACCOUNT_ID,
  HELIX_STRIPE_WEBHOOK_EVENTS,
  HELIX_STRIPE_WEBHOOK_URL,
  assertNoConflictingEventDestinations,
  assertApprovedStripeSandboxAccount,
  planSandboxWebhookEndpoint,
  syncSandboxWebhookEndpoint,
} from "@/scripts/stripe/sandbox-webhook";

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    api_version: "2026-06-24.dahlia",
    description: "helix Sandbox Checkout",
    enabled_events: [...HELIX_STRIPE_WEBHOOK_EVENTS],
    id: "we_existing",
    livemode: false,
    metadata: {
      contract: "helix_checkout",
      environment: "sandbox",
      managed_by: "pnpm stripe:sync:sandbox",
    },
    status: "enabled",
    url: HELIX_STRIPE_WEBHOOK_URL,
    ...overrides,
  };
}

describe("Stripe sandbox endpoint plan", () => {
  it("accepts the v2 inventory mirror of the current v1 endpoint", () => {
    const currentEndpoint = endpoint({
      enabled_events: ["checkout.session.completed"],
      url: "https://mei-pelle.vercel.app/api/webhooks/stripe",
    });
    expect(() =>
      assertNoConflictingEventDestinations(
        [
          {
            enabled_events: ["checkout.session.completed"],
            events_from: ["@self"],
            id: "we_existing",
            status: "enabled",
            type: "webhook_endpoint",
            webhook_endpoint: {
              url: "https://mei-pelle.vercel.app/api/webhooks/stripe",
            },
          },
        ],
        currentEndpoint,
      ),
    ).not.toThrow();
  });

  it("fails closed on additional or mismatched v2 event destinations", () => {
    const mirror = {
      enabled_events: [...HELIX_STRIPE_WEBHOOK_EVENTS],
      events_from: ["@self"],
      id: "we_existing",
      status: "enabled",
      type: "webhook_endpoint",
      webhook_endpoint: { url: HELIX_STRIPE_WEBHOOK_URL },
    };
    expect(() =>
      assertNoConflictingEventDestinations(
        [mirror, { ...mirror, id: "we_other" }],
        endpoint(),
      ),
    ).toThrow(/manual reconciliation/i);
    expect(() =>
      assertNoConflictingEventDestinations(
        [{ ...mirror, webhook_endpoint: { url: "https://example.com/webhook" } }],
        endpoint(),
      ),
    ).toThrow(/manual reconciliation/i);
  });

  it("requires an explicit one-time creation authorization when no endpoint exists", () => {
    expect(planSandboxWebhookEndpoint([], null, false)).toEqual({
      action: "blocked",
      reason: "missing",
    });
    expect(planSandboxWebhookEndpoint([], null, true)).toEqual({ action: "create" });
  });

  it("updates the configured endpoint in place without rotating its secret", () => {
    expect(
      planSandboxWebhookEndpoint(
        [
          endpoint({
            description: "Mei Pelle sandbox Checkout",
            enabled_events: ["checkout.session.completed"],
            url: "https://mei-pelle.vercel.app/api/webhooks/stripe",
          }),
        ],
        "we_existing",
        false,
      ),
    ).toEqual({ action: "update", endpointId: "we_existing" });
  });

  it("fails closed on duplicate, live, unknown, or incompatible endpoints", () => {
    expect(() =>
      planSandboxWebhookEndpoint([endpoint(), endpoint({ id: "we_other" })], null, true),
    ).toThrow(/multiple/i);
    expect(() =>
      planSandboxWebhookEndpoint([endpoint({ livemode: true })], "we_existing", false),
    ).toThrow(/live/i);
    expect(() =>
      planSandboxWebhookEndpoint([endpoint()], "we_unknown", false),
    ).toThrow(/configured/i);
    expect(() =>
      planSandboxWebhookEndpoint(
        [endpoint({ api_version: "2026-05-27.dahlia" })],
        "we_existing",
        false,
      ),
    ).toThrow(/API version/i);
  });
});

describe("Stripe sandbox endpoint synchronization", () => {
  it("creates exactly one endpoint with the supported event contract", async () => {
    const create = vi.fn().mockResolvedValue({
      ...endpoint({ id: "we_created" }),
      secret: "whsec_created",
    });

    await expect(
      syncSandboxWebhookEndpoint(
        { webhookEndpoints: { create, update: vi.fn() } },
        { action: "create" },
      ),
    ).resolves.toEqual({
      endpointId: "we_created",
      rotatedSecret: "whsec_created",
      status: "created",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        api_version: "2026-06-24.dahlia",
        connect: false,
        enabled_events: [...HELIX_STRIPE_WEBHOOK_EVENTS],
        url: HELIX_STRIPE_WEBHOOK_URL,
      }),
      { idempotencyKey: "helix-sandbox-webhook:helixskin.vercel.app" },
    );
  });

  it("updates the same endpoint and reports no secret rotation", async () => {
    const update = vi.fn().mockResolvedValue(endpoint());

    await expect(
      syncSandboxWebhookEndpoint(
        { webhookEndpoints: { create: vi.fn(), update } },
        { action: "update", endpointId: "we_existing" },
      ),
    ).resolves.toEqual({
      endpointId: "we_existing",
      rotatedSecret: null,
      status: "updated",
    });
    expect(update).toHaveBeenCalledWith(
      "we_existing",
      expect.objectContaining({ url: HELIX_STRIPE_WEBHOOK_URL }),
    );
  });
});

describe("Stripe sandbox account identity", () => {
  it("accepts only the approved account", () => {
    expect(() =>
      assertApprovedStripeSandboxAccount({
        id: APPROVED_STRIPE_SANDBOX_ACCOUNT_ID,
      }),
    ).not.toThrow();
  });

  it("rejects a different Stripe account", () => {
    expect(() =>
      assertApprovedStripeSandboxAccount({ id: "acct_other" }),
    ).toThrow(/unapproved Stripe sandbox account/i);
  });
});
