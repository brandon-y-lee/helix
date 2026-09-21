import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutCancellationCleanup } from "@/components/cart/CheckoutCancellationCleanup";
import {
  buildCheckoutCancelUrl,
  isCheckoutCancelledSearchParams,
} from "@/lib/orders/checkout-cancel";

const { refreshCart } = vi.hoisted(() => ({ refreshCart: vi.fn() }));
vi.mock("@/components/cart/useCart", () => ({
  useCart: () => ({ refresh: refreshCart }),
}));
beforeEach(() => {
  refreshCart.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe("checkout cancellation routing", () => {
  it("builds a cart cancel URL without public order identifiers", () => {
    const url = buildCheckoutCancelUrl("https://helix.test");
    const parsed = new URL(url);

    expect(parsed.pathname).toBe("/cart");
    expect(parsed.searchParams.get("checkout")).toBe("cancelled");
    expect(parsed.searchParams.has("order_id")).toBe(false);
    expect(parsed.searchParams.has("session_id")).toBe(false);
    expect(parsed.searchParams.has("payment_intent")).toBe(false);
    expect(parsed.search).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it("recognizes only the generic cancelled cart signal", () => {
    expect(isCheckoutCancelledSearchParams({ checkout: "cancelled" })).toBe(true);
    expect(isCheckoutCancelledSearchParams({ checkout: ["cancelled"] })).toBe(true);
    expect(isCheckoutCancelledSearchParams({ checkout: "order-123" })).toBe(false);
    expect(isCheckoutCancelledSearchParams({})).toBe(false);
  });

  it("waits for an explicit cancellation click before sending strict JSON", async () => {
    const fetchRequest = vi.fn().mockResolvedValue(Response.json({ status: "cancelled" }));
    vi.stubGlobal("fetch", fetchRequest);
    const user = userEvent.setup();

    render(<CheckoutCancellationCleanup active />);

    expect(fetchRequest).not.toHaveBeenCalled();
    expect(refreshCart).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel pending checkout" }));

    expect(fetchRequest).toHaveBeenCalledWith(
      "/cart/checkout-cancel",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Sandbox checkout was cancelled.");
    expect(refreshCart).toHaveBeenCalledOnce();
  });

  it("supports keyboard cancellation and retry while payment is processing", async () => {
    const fetchRequest = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: "processing" }))
      .mockResolvedValueOnce(Response.json({ status: "cancelled" }));
    vi.stubGlobal("fetch", fetchRequest);
    const user = userEvent.setup();
    render(<CheckoutCancellationCleanup active />);

    await user.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "This payment is still processing. Try again shortly.",
    );
    expect(screen.getByRole("button")).toBeEnabled();
    expect(refreshCart).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button"));
    expect(await screen.findByRole("status")).toHaveTextContent("Sandbox checkout was cancelled.");
    expect(screen.getByRole("button")).toBeDisabled();
    expect(fetchRequest).toHaveBeenCalledTimes(2);
    expect(refreshCart).toHaveBeenCalledOnce();
  });

  it.each([
    ["paid", "This checkout has already completed."],
    ["unavailable", "No pending checkout is available to cancel."],
  ])("reports %s truthfully without claiming cancellation", async (status, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status })));
    const user = userEvent.setup();
    render(<CheckoutCancellationCleanup active />);

    await user.click(screen.getByRole("button"));

    expect(await screen.findByRole("status")).toHaveTextContent(message);
    expect(screen.getByRole("status")).not.toHaveTextContent("was cancelled");
    expect(screen.getByRole("button")).toBeDisabled();
    if (status === "paid") expect(refreshCart).toHaveBeenCalledOnce();
    else expect(refreshCart).not.toHaveBeenCalled();
  });

  it("disables repeat cancellation while the server response is pending", async () => {
    let finishRequest: (response: Response) => void = () => undefined;
    const response = new Promise<Response>((resolve) => { finishRequest = resolve; });
    const fetchRequest = vi.fn().mockReturnValue(response);
    vi.stubGlobal("fetch", fetchRequest);
    const user = userEvent.setup();
    render(<CheckoutCancellationCleanup active />);

    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button", { name: "Cancelling checkout" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Checking pending checkout…");
    await user.click(screen.getByRole("button"));
    expect(fetchRequest).toHaveBeenCalledTimes(1);
    expect(refreshCart).not.toHaveBeenCalled();

    await act(async () => { finishRequest(Response.json({ status: "cancelled" })); });
    expect(screen.getByRole("status")).toHaveTextContent("Sandbox checkout was cancelled.");
    expect(refreshCart).toHaveBeenCalledOnce();
  });

  it.each([429, 503])("keeps a %s failure retryable without claiming cancellation", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
      { error: "private details must not be displayed", status: "cancelled" },
      { status },
    )));
    const user = userEvent.setup();
    render(<CheckoutCancellationCleanup active />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByRole("status")).toHaveTextContent("We couldn't cancel checkout. Try again in a moment.");
    expect(screen.getByRole("status")).not.toHaveTextContent(/was cancelled|private details/);
    expect(screen.getByRole("button")).toBeEnabled();
    expect(refreshCart).not.toHaveBeenCalled();
  });
});
