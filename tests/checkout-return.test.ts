import { describe, expect, it } from "vitest";
import { checkoutReturnDestinationState } from "@/lib/orders/checkout-return";

const origin = "https://www.helixskin.us";
const session = { id: "cs_test_bound", success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/cart?checkout=cancelled` };
describe("payable Checkout return destinations", () => {
  it.each(["{CHECKOUT_SESSION_ID}", "cs_test_bound"])("accepts only the expected same-origin routes with %s", (id) => {
    expect(checkoutReturnDestinationState({ ...session, success_url: `${origin}/checkout/success?session_id=${id}` }, origin)).toBe("match");
  });
  it.each(["success_url", "cancel_url"] as const)("detects a different controlled host in %s", (key) => {
    expect(checkoutReturnDestinationState({ ...session, [key]: session[key].replace(origin, "https://helixskin.vercel.app") }, origin)).toBe("origin_changed");
  });
  it.each([
    { success_url: null }, { cancel_url: undefined }, { success_url: "garbage" },
    { success_url: `${origin}/checkout/success?session_id=cs_other` },
    { success_url: `${origin}/checkout/success?session_id=cs_test_bound&session_id=cs_test_bound` },
    { success_url: `${origin}/checkout/success?session_id=cs_test_bound&next=https://attacker.example` },
    { success_url: `${origin}/checkout/success?session_id=cs_test_bound#fragment` },
    { cancel_url: `${origin}/cart?checkout=cancelled&extra=1` },
    { cancel_url: `${origin}/cart/?checkout=cancelled` },
    { cancel_url: "https://user@www.helixskin.us/cart?checkout=cancelled" },
    { cancel_url: "https://attacker.example/cart?checkout=cancelled" },
  ])("rejects unusable or ambiguous return proof %#", (change) => {
    expect(checkoutReturnDestinationState({ ...session, ...change }, origin)).toBe("invalid");
  });
});
