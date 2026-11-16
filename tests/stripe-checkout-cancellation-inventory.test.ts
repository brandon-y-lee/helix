import { describe, expect, it, vi } from "vitest";
import {
  verifyCheckoutCancellationRetirement,
  type CancellationInventorySession,
} from "@/scripts/stripe/checkout-cancellation-inventory";

const observedAt = new Date("2026-09-14T06:00:00Z");

function session(overrides: Partial<CancellationInventorySession> = {}): CancellationInventorySession {
  return {
    livemode: false,
    status: "expired",
    cancel_url: "https://helix.test/checkout/cancel?order_id=private-order",
    expires_at: 1_789_351_200,
    after_expiration: null,
    ...overrides,
  };
}

function clientFor(sessions: CancellationInventorySession[]) {
  return {
    accounts: { retrieve: vi.fn().mockResolvedValue({ id: "acct_1Tm9WRFEzyaKzdmq" }) },
    checkout: {
      sessions: {
        list: vi.fn(async function* () {
          for (const item of sessions) yield item;
        }),
      },
    },
  };
}

describe("sandbox cancellation route retirement inventory", () => {
  it("rejects unsafe credentials and accounts before inventorying any sessions", async () => {
    const client = clientFor([]);
    const createClient = vi.fn(() => client);
    for (const secretKey of [undefined, "sk_live_private", "rk_test_private", "invalid"]) {
      await expect(verifyCheckoutCancellationRetirement({ secretKey, createClient, observedAt }))
        .rejects.toThrow("sandbox-key-required");
    }
    expect(createClient).not.toHaveBeenCalled();

    client.accounts.retrieve.mockResolvedValue({ id: "acct_private_unapproved" });
    await expect(verifyCheckoutCancellationRetirement({
      secretKey: "sk_test_private", createClient, observedAt,
    })).rejects.toThrow("unapproved-account");
    expect(client.checkout.sessions.list).not.toHaveBeenCalled();
  });

  it("finishes the complete inventory and reports only aggregate retirement evidence", async () => {
    const client = clientFor([
      session(),
      session({ status: "complete" }),
      session({ status: "open", cancel_url: "https://helix.test/cart?checkout=cancelled" }),
    ]);

    const report = await verifyCheckoutCancellationRetirement({
      secretKey: "sk_test_private",
      createClient: () => client,
      observedAt,
    });

    expect(report).toEqual({
      observedAt: "2026-09-14T06:00:00.000Z",
      environment: "sandbox",
      approvedAccount: true,
      scanComplete: true,
      status: "ready",
      sessions: { total: 3, open: 1, complete: 1, expired: 1 },
      legacySessions: 2,
      blockingOpenSessions: 0,
      blockingRecoveryLinks: 0,
      unknownSessions: 0,
      malformedCancelUrls: 0,
      latestBlockingExpiry: null,
    });
    expect(client.checkout.sessions.list).toHaveBeenCalledWith({ limit: 100 });
    expect(JSON.stringify(report)).not.toMatch(/private|https:|acct_|sk_test_/);
  });

  it("blocks on open legacy sessions and unexpired recovery links found after the first page", async () => {
    const futureExpiry = Math.floor(observedAt.getTime() / 1000) + 3600;
    const client = clientFor([
      ...Array.from({ length: 100 }, () => session({ cancel_url: null })),
      session({ status: "open" }),
      session({
        cancel_url: "https://helix.test/checkout/cancel/?order_id=private-order",
        after_expiration: { recovery: { enabled: true, expires_at: futureExpiry } },
      }),
      session({ after_expiration: { recovery: { enabled: true, expires_at: 1 } } }),
    ]);

    const report = await verifyCheckoutCancellationRetirement({
      secretKey: "sk_test_private", createClient: () => client, observedAt,
    });

    expect(report).toMatchObject({
      status: "blocked",
      sessions: { total: 103 },
      legacySessions: 3,
      blockingOpenSessions: 1,
      blockingRecoveryLinks: 1,
      latestBlockingExpiry: "2026-09-14T07:00:00.000Z",
    });
  });

  it("fails closed when a session cannot be safely classified", async () => {
    for (const [item, expected] of [
      [session({ status: null }), { unknownSessions: 1 }],
      [session({ cancel_url: "not-a-url-private" }), { malformedCancelUrls: 1 }],
      [session({ after_expiration: { recovery: { enabled: true, expires_at: null } } }), { unknownSessions: 1 }],
      [session({ status: "open", expires_at: Number.NaN }), { unknownSessions: 1 }],
    ] as const) {
      const report = await verifyCheckoutCancellationRetirement({
        secretKey: "sk_test_private", createClient: () => clientFor([item]), observedAt,
      });
      expect(report).toMatchObject({ status: "blocked", ...expected });
    }
    await expect(verifyCheckoutCancellationRetirement({
      secretKey: "sk_test_private",
      createClient: () => clientFor([session({ livemode: true })]),
      observedAt,
    })).rejects.toThrow("non-sandbox-session");
  });

  it("never reports a successful partial scan or exposes provider failure payloads", async () => {
    const client = clientFor([]);
    client.checkout.sessions.list.mockImplementation(async function* () {
      yield session();
      throw new Error("private-customer@example.test sk_test_private provider-payload");
    });
    await expect(verifyCheckoutCancellationRetirement({
      secretKey: "sk_test_private", createClient: () => client, observedAt,
    })).rejects.toThrow(/^inventory-read-failed$/);
  });
});
