import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTH_DEGRADED_REQUEST_HEADER,
  CART_CHANGE_CHANNEL,
  CART_IDENTITY_CHANGED_COOKIE,
  COOKIE_ACKNOWLEDGEMENT_COOKIE,
  GUEST_CART_COOKIE,
  PENDING_CHECKOUT_COOKIE,
  REFERRAL_COOKIE,
} from "@/lib/customer-state-identifiers";

const customerStateRuntimeFiles = [
  "lib/cart/server.ts",
  "lib/cart/sync.ts",
  "lib/orders/checkout-cancel.ts",
  "lib/referrals/constants.ts",
  "lib/supabase/auth-cookies.ts",
  "components/privacy/CookieAcknowledgementDialog.tsx",
];

describe("helix customer-state identifiers", () => {
  it("uses one helix identifier family at every browser and request seam", () => {
    expect({
      authHeader: AUTH_DEGRADED_REQUEST_HEADER,
      cartChannel: CART_CHANGE_CHANNEL,
      cartIdentity: CART_IDENTITY_CHANGED_COOKIE,
      acknowledgement: COOKIE_ACKNOWLEDGEMENT_COOKIE,
      guestCart: GUEST_CART_COOKIE,
      pendingCheckout: PENDING_CHECKOUT_COOKIE,
      referral: REFERRAL_COOKIE,
    }).toEqual({
      authHeader: "x-helix-auth-degraded",
      cartChannel: "helix-cart",
      cartIdentity: "helix_cart_identity_changed",
      acknowledgement: "helix_cookie_acknowledgement",
      guestCart: "helix_guest_cart",
      pendingCheckout: "helix_pending_checkout",
      referral: "helix_referral_code",
    });
  });

  it("does not retain a runtime read, write, or alias for old customer state", () => {
    const runtime = customerStateRuntimeFiles
      .map((path) => readFileSync(resolve(path), "utf8"))
      .join("\n");

    expect(runtime).not.toMatch(
      /mei_pelle_(?:guest_cart|cart_identity_changed|pending_checkout|referral_code|cookie_preferences)|mei-pelle-cart|x-mei-pelle-auth-degraded/i,
    );
  });
});

describe("prelaunch Cart cleanup", () => {
  it("guards the exact inventoried Cart set and preserves Order and payment history", () => {
    const migrationName = readdirSync(resolve("supabase/migrations")).find(
      (name) => name.endsWith("_remove_disposable_prelaunch_carts.sql"),
    );
    expect(migrationName).toBeDefined();

    const migration = readFileSync(
      resolve("supabase/migrations", migrationName!),
      "utf8",
    );
    expect(migration).toContain("v_expected_carts constant bigint := 602");
    expect(migration).toContain("v_expected_cart_items constant bigint := 507");
    expect(migration).toContain("delete from public.carts");
    expect(migration).toContain("on delete set null");
    expect(migration).not.toMatch(
      /delete\s+from\s+public\.(?:orders|order_items|payment_attempts|stripe_webhook_events)/i,
    );
  });
});
