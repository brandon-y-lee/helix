import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdpPurchaseIsland, type PdpPurchaseIslandProps } from "@/components/product-detail/PdpPurchaseIsland";
import { registerHeaderCartFocus } from "@/components/overlays/modal-state";

const purchaseMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/cart/useProductPurchase", async () => {
  const { useState } = await import("react");
  return { useProductPurchase: () => {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    return { pending, error, purchase: async (input: unknown) => {
      setPending(true);
      setError("");
      const ok = await purchaseMock(input);
      setPending(false);
      if (!ok) setError("Cart is temporarily unavailable. Try again in a moment.");
      return ok;
    } };
  } };
});
vi.mock("@/components/product-detail/AfterpayMessaging", () => ({ AfterpayMessaging: () => null }));
vi.mock("@/components/product/ProductImage", () => ({ ProductImage: () => <span /> }));

let width = 390;
let mainBottom = 90;
let videoTop = 400;
let footerTop = 2000;
let stickyTop = 700;
const mediaListeners = new Set<() => void>();
const fallbackFocus = vi.fn();
let unregisterFocus: () => void;
let headerCartButton: HTMLButtonElement;

const props: PdpPurchaseIslandProps = {
  accordions: <div>Product details</div>,
  cartItem: { slug: "super-serum", name: "Super Serum", swatch: ["#eee", "#ddd"], imageUrl: null, imageAlt: null, placeholderMedia: null },
  children: <h1>Super Serum</h1>,
  currency: "USD", productKey: "super-serum", productId: "product-test", productName: "Super Serum", productType: "Serum", productFamily: null,
  routineLabel: "The Core", stickyMedia: null, stripePublishableKey: null, unavailableLabel: "COMING SOON", status: "coming_soon",
  variants: [], showPrice: false, showVariantOptions: false,
  presentation: "mobile-pilot",
};

function rect(top: number, height = 48) {
  return { x: 16, y: top, top, bottom: top + height, left: 16, right: width - 16, width: width - 32, height, toJSON: () => ({}) } as DOMRect;
}

async function changeViewport(nextWidth = width) {
  width = nextWidth;
  await act(async () => {
    for (const listener of mediaListeners) listener();
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  });
}

function mount(overrides: Partial<PdpPurchaseIslandProps> = {}) {
  return render(<><PdpPurchaseIsland {...props} {...overrides} /><span data-pdp-video-start /><footer id="site-footer" /></>);
}

beforeEach(() => {
  width = 390; mainBottom = 90; videoTop = 400; footerTop = 2000; stickyTop = 700;
  purchaseMock.mockReset().mockResolvedValue(true);
  fallbackFocus.mockReset();
  headerCartButton = document.createElement("button");
  headerCartButton.textContent = "Header Cart";
  document.body.append(headerCartButton);
  unregisterFocus = registerHeaderCartFocus(() => {
    fallbackFocus();
    headerCartButton.focus();
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() { return query === "(max-width: 820px)" ? width <= 820 : query.includes("reduced-motion"); },
    media: query, addEventListener: (_: string, callback: () => void) => mediaListeners.add(callback), removeEventListener: (_: string, callback: () => void) => mediaListeners.delete(callback),
  }));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute("data-pdp-buy-button")) return rect(mainBottom - 48);
    if (this.hasAttribute("data-pdp-video-start")) return rect(videoTop, 2);
    if (this.id === "site-footer") return rect(footerTop, 800);
    if (this.hasAttribute("data-sticky-pdp-buy-button")) return rect(stickyTop);
    return rect(0);
  });
});

afterEach(() => { unregisterFocus(); headerCartButton.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); mediaListeners.clear(); });

describe("Super Serum mobile purchase", () => {
  it("uses the passed main action boundary even while the video remains below the viewport", async () => {
    const { container } = mount();
    const sticky = container.querySelector(".pdp-sticky-purchase")!;
    expect(sticky).toHaveAttribute("data-visible", "false");
    mainBottom = -1;
    await changeViewport();
    expect(sticky).toHaveAttribute("data-visible", "true");
    expect(within(sticky as HTMLElement).getByRole("button", { name: /Super Serum/ })).toBeDisabled();
    footerTop = 500;
    await changeViewport();
    expect(sticky).toHaveAttribute("data-visible", "false");
    expect(sticky).toHaveAttribute("inert");
    footerTop = 2000;
    mainBottom = 90;
    await changeViewport();
    expect(sticky).toHaveAttribute("data-visible", "false");
  });

  it("shares selected configuration and pending/error state with the sticky action", async () => {
    const user = userEvent.setup();
    mainBottom = -1;
    const { container } = mount({ status: "available", showPrice: true, showVariantOptions: true, variants: [
      { id: "small", label: "15 mL", price: 2500, available: true, purchaseLabel: "BUY - $25.00", purchasable: true },
      { id: "large", label: "30 mL", price: 4200, available: true, purchaseLabel: "BUY - $42.00", purchasable: true },
    ] });
    const select = screen.getByRole("combobox", { name: "Super Serum configuration" });
    await user.selectOptions(select, "large");
    expect(screen.getByRole("button", { name: "30 mL" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "15 mL" }));
    expect(select).toHaveValue("small");
    let resolveAdd: (ok: boolean) => void;
    purchaseMock.mockImplementationOnce(() => new Promise<boolean>((resolve) => { resolveAdd = resolve; }));
    const sticky = container.querySelector(".pdp-sticky-purchase") as HTMLElement;
    const stickyButton = within(sticky).getByRole("button", { name: /Super Serum/ });
    await user.click(stickyButton);
    expect(stickyButton).toBeDisabled();
    expect(select).toBeDisabled();
    expect(screen.getByRole("button", { name: "30 mL" })).toBeDisabled();
    const main = container.querySelector("[data-pdp-buy-button]")!;
    expect(main).toBeDisabled();
    fireEvent.click(main);
    expect(purchaseMock).toHaveBeenCalledTimes(1);
    await act(async () => resolveAdd!(false));
    expect(within(sticky).getByRole("status")).toHaveTextContent("Cart is temporarily unavailable");
    expect(stickyButton).toBeEnabled();
    expect(purchaseMock.mock.calls[0][0].item.variantId).toBe("small");
    await changeViewport(821);
    expect(screen.queryByRole("combobox", { name: "Super Serum configuration" })).not.toBeInTheDocument();
    await changeViewport(820);
    expect(screen.getByRole("combobox", { name: "Super Serum configuration" })).toHaveValue("small");
  });

  it.each([820, 821, 920, 921])("keeps waitlist state and returns visible focus after resize to %s", async (nextWidth) => {
    const user = userEvent.setup();
    mainBottom = -1;
    const { container } = mount({ status: "waitlist" });
    const sticky = container.querySelector(".pdp-sticky-purchase")!;
    const trigger = within(sticky as HTMLElement).getByRole("button", { name: /Join the waitlist/ });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(sticky).toHaveAttribute("data-visible", "false");
    await user.type(within(dialog).getByRole("textbox", { name: "Email address" }), "visitor@example.com");
    await changeViewport(nextWidth);
    expect(within(dialog).getByRole("textbox", { name: "Email address" })).toHaveValue("visitor@example.com");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    if (nextWidth <= 820) {
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(fallbackFocus).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(fallbackFocus).toHaveBeenCalledOnce());
      expect(trigger).not.toHaveFocus();
    }
    expect(document.body).not.toHaveAttribute("data-sheet-scroll-lock");
  });

  it("prefers the returned main action, then header Cart when the footer is visible", async () => {
    const user = userEvent.setup();
    mainBottom = -1;
    const { container } = mount({ status: "available", variants: [{ id: "single", label: "15 mL", price: 2500, available: true, purchaseLabel: "BUY", purchasable: true }] });
    await user.click(within(container.querySelector(".pdp-sticky-purchase") as HTMLElement).getByRole("button"));
    const returnFocus = purchaseMock.mock.calls[0][0].returnFocus as () => void;
    mainBottom = 150;
    await changeViewport();
    act(returnFocus);
    await waitFor(() => expect(container.querySelector("[data-pdp-buy-button]")).toHaveFocus());
    mainBottom = -1; footerTop = 500;
    await changeViewport();
    act(returnFocus);
    await waitFor(() => expect(fallbackFocus).toHaveBeenCalledOnce());
  });

  it("does not restore focus to a main action concealed beneath the revealed header", async () => {
    const user = userEvent.setup();
    mainBottom = -1;
    const view = mount({ status: "available", variants: [{ id: "single", label: "15 mL", price: 2500, available: true, purchaseLabel: "BUY", purchasable: true }] });
    const header = document.createElement("header");
    header.className = "site-header";
    header.dataset.navState = "revealed";
    view.container.append(header);
    await user.click(within(view.container.querySelector(".pdp-sticky-purchase") as HTMLElement).getByRole("button"));
    mainBottom = 70;
    await changeViewport();
    act(purchaseMock.mock.calls[0][0].returnFocus);
    await waitFor(() => expect(fallbackFocus).toHaveBeenCalledOnce());
    expect(view.container.querySelector("[data-pdp-buy-button]")).not.toHaveFocus();
  });

  it.each(["footer", "main action"])("restores visible focus when the focused sticky configuration is hidden by %s", async (boundary) => {
    mainBottom = -1;
    mount({ status: "available", showVariantOptions: true, variants: [
      { id: "small", label: "15 mL", price: 2500, available: true, purchaseLabel: "BUY", purchasable: true },
      { id: "large", label: "30 mL", price: 4200, available: true, purchaseLabel: "BUY", purchasable: true },
    ] });
    const select = screen.getByRole("combobox");
    select.focus();
    if (boundary === "footer") footerTop = 500;
    else mainBottom = 150;
    await changeViewport();
    if (boundary === "footer") await waitFor(() => expect(fallbackFocus).toHaveBeenCalledOnce());
    else await waitFor(() => expect(document.querySelector("[data-pdp-buy-button]")).toHaveFocus());
    expect(select).not.toHaveFocus();
  });

  it("waits for the sticky reveal animation before deciding where to restore focus", async () => {
    const user = userEvent.setup();
    mainBottom = -1;
    const { container } = mount({ status: "available", variants: [{ id: "single", label: "15 mL", price: 2500, available: true, purchaseLabel: "BUY", purchasable: true }] });
    const panel = container.querySelector(".pdp-sticky-purchase") as HTMLElement;
    const trigger = within(panel).getByRole("button");
    await user.click(trigger);
    headerCartButton.focus();
    stickyTop = 730;
    let finishAnimation: () => void;
    const finished = new Promise<void>((resolve) => { finishAnimation = resolve; });
    Object.defineProperty(panel, "getAnimations", { value: () => [{ playState: "running", finished }] });
    act(purchaseMock.mock.calls[0][0].returnFocus);
    await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(resolve)); });
    expect(fallbackFocus).not.toHaveBeenCalled();
    await act(async () => { stickyTop = 700; finishAnimation!(); });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(fallbackFocus).not.toHaveBeenCalled();
  });
});
