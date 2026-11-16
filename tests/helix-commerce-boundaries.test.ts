import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  getCurrentIdentity: vi.fn(),
  rpc: vi.fn(),
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
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    rpc: boundary.rpc,
  })),
}));

import { mergeGuestCartIntoCurrentUser } from "@/lib/cart/server";
import {
  GUEST_CART_COOKIE,
  CHECKOUT_RECEIPT_COOKIE,
} from "@/lib/customer-state-identifiers";

beforeEach(() => {
  vi.clearAllMocks();
  boundary.rpc.mockResolvedValue({ data: null, error: null });
});

describe("Cart ownership transition boundary", () => {
  it("merges the guest cart into the signed-in Account without retiring its independent receipt", async () => {
    const token = "helix-cart-bearer";
    boundary.cookieGet.mockImplementation((name: string) =>
      name === GUEST_CART_COOKIE ? { value: token } : name === CHECKOUT_RECEIPT_COOKIE ? { value: "independent-receipt" } : undefined,
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
    expect(boundary.cookieSet).not.toHaveBeenCalledWith(CHECKOUT_RECEIPT_COOKIE, expect.anything(), expect.anything());
    expect(boundary.cookieSet).toHaveBeenCalledWith(
      GUEST_CART_COOKIE,
      "",
      expect.objectContaining({ httpOnly: true, maxAge: 0, path: "/" }),
    );
  });
});
