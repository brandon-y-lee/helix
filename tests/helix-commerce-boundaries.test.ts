import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  assertSandboxStripeObject: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  getCurrentIdentity: vi.fn(),
  getCurrentUser: vi.fn(),
  retrieveSession: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: boundary.cookieGet,
    set: boundary.cookieSet,
  })),
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
  getCurrentIdentity: boundary.getCurrentIdentity,
  getCurrentUser: boundary.getCurrentUser,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: boundary.from,
    rpc: boundary.rpc,
  })),
}));

vi.mock("@/lib/checkout/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/checkout/config")>();
  return {
    ...actual,
    assertSandboxStripeObject: boundary.assertSandboxStripeObject,
    readCheckoutConfig: vi.fn(() => ({})),
  };
});

vi.mock("@/lib/stripe/server", () => ({
  getStripeClient: vi.fn(() => ({
    checkout: { sessions: { retrieve: boundary.retrieveSession } },
  })),
}));

import { mergeGuestCartIntoCurrentUser } from "@/lib/cart/server";
import { getOrderConfirmationBySession } from "@/lib/orders/server";
import {
  GUEST_CART_COOKIE,
} from "@/lib/customer-state-identifiers";

beforeEach(() => {
  vi.clearAllMocks();
  boundary.rpc.mockResolvedValue({ data: null, error: null });
  boundary.getCurrentUser.mockResolvedValue(null);
});

describe("Cart ownership transition boundary", () => {
  it("merges the helix bearer cookie into the signed-in Account and retires it", async () => {
    const token = "helix-cart-bearer";
    boundary.cookieGet.mockImplementation((name: string) =>
      name === GUEST_CART_COOKIE ? { value: token } : undefined,
    );
    boundary.getCurrentIdentity.mockResolvedValue({
      email: "customer@example.test",
      id: "00000000-0000-4000-8000-000000000181",
    });

    await mergeGuestCartIntoCurrentUser();

    expect(boundary.rpc).toHaveBeenCalledWith("merge_guest_cart", {
      p_user_id: "00000000-0000-4000-8000-000000000181",
      p_guest_token_hash: createHash("sha256").update(token).digest("hex"),
    });
    expect(boundary.cookieSet).toHaveBeenCalledWith(
      GUEST_CART_COOKIE,
      "",
      expect.objectContaining({ httpOnly: true, maxAge: 0, path: "/" }),
    );
  });
});

describe("verified Checkout completion boundary", () => {
  it("returns confirmation only after a paid sandbox session is verified", async () => {
    const session = {
      amount_total: 4200,
      currency: "usd",
      id: "cs_test_helix_verified",
      livemode: false,
      payment_status: "paid",
      status: "complete",
    };
    const order = {
      cart_id: null,
      id: "00000000-0000-4000-8000-000000000181",
      order_number: "HX-000181",
      referral_code: null,
      reward_points_earned: 0,
      status: "paid",
      user_id: null,
    };
    const items = [{ id: "order-line-181", product_name: "TREAT" }];
    boundary.retrieveSession.mockResolvedValue(session);
    boundary.from.mockImplementation((table: string) => {
      const query = {
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: order, error: null })),
        order: vi.fn(async () => ({ data: items, error: null })),
        select: vi.fn(() => query),
      };
      expect(["orders", "order_items"]).toContain(table);
      return query;
    });

    const confirmation = await getOrderConfirmationBySession(session.id);

    expect(boundary.retrieveSession).toHaveBeenCalledWith(session.id);
    expect(boundary.assertSandboxStripeObject).toHaveBeenCalledWith(session);
    expect(confirmation).toMatchObject({
      items,
      order: { id: order.id, status: "paid" },
      webhookPending: false,
    });
  });
});
