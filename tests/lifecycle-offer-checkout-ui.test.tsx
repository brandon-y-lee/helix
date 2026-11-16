import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const cart = vi.hoisted(() => ({ startCheckout: vi.fn().mockResolvedValue(null), resetErrors: vi.fn() }));
vi.mock("@/components/cart/useCart", () => ({ useCartMutations: () => ({ ...cart, checkoutPending: false, checkoutError: null }) }));
import { CheckoutPanel } from "@/components/cart/CheckoutPanel";
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("explicit nonstacking cart offers", () => {
  it("lets the customer choose an offer or points, never both", async () => {
    const id="11111111-1111-4111-8111-111111111111";
    vi.stubGlobal("fetch", vi.fn((path: string) => Promise.resolve(Response.json(path === "/api/offers"
      ? { offers: [{ id, kind:"welcome", percentOff:15, expiresAt:"2030-01-01T00:00:00Z" }] }
      : {authenticated:true,affordableTiers:[{id:"points_200",points:200,discountCents:500,label:"$5 off"}]}))));
    render(<CheckoutPanel disabled={false} subtotal={5000} cartUpdatedAt={1}/>);
    const offer=await screen.findByLabelText(/15% off merchandise/);
    fireEvent.click(offer);
    fireEvent.click(screen.getByRole("button",{name:"Checkout $42.50"}));
    await waitFor(()=>expect(cart.startCheckout).toHaveBeenLastCalledWith(null,id));
    fireEvent.click(screen.getByLabelText(/\$5 off \(200 Points\)/));
    expect(offer).not.toBeChecked();
    fireEvent.click(screen.getByRole("button",{name:"Checkout $50.00"}));
    await waitFor(()=>expect(cart.startCheckout).toHaveBeenLastCalledWith("points_200",undefined));
    expect(screen.getByText(/cannot be combined/)).toBeVisible();
  });
});
