import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CartDrawer } from "@/components/CartDrawer";
import {
  PDP_SLIDE_DURATION_MS,
  PDP_SLIDE_EASING,
} from "@/components/usePdpSlideTransition";

vi.mock("@/components/CartView", () => ({
  CartView: () => <div>Cart contents</div>,
}));

afterEach(() => {
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
  document.body.style.removeProperty("--sheet-scrollbar-width");
  document.body.removeAttribute("data-sheet-scroll-lock");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function finishTransformTransition(element: Element) {
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: "transform" });
  fireEvent(element, event);
}

function Drawer({
  open,
  onClose,
  returnFocus = () => {},
}: {
  open: boolean;
  onClose: () => void;
  returnFocus?: () => void;
}) {
  return (
    <CartDrawer
      open={open}
      onClose={onClose}
      returnFocus={returnFocus}
    />
  );
}

describe("CartDrawer motion", () => {
  it("keeps one closed drawer mounted before opening with shared PDP timing", () => {
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame");
    const { rerender } = render(<Drawer open={false} onClose={() => {}} />);

    const overlay = document.querySelector(".cart-sheet-overlay");
    const panel = document.querySelector(".cart-sheet");
    expect(overlay).toHaveAttribute("data-state", "closed");
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(overlay).toHaveAttribute("inert");
    expect(panel).toHaveAttribute("data-state", "closed");
    expect(panel).toHaveStyle({
      "--pdp-slide-duration": `${PDP_SLIDE_DURATION_MS}ms`,
      "--pdp-slide-easing": PDP_SLIDE_EASING,
    });
    expect(screen.queryByRole("dialog", { name: "Cart" })).toBeNull();

    rerender(<Drawer open onClose={() => {}} />);

    expect(screen.getByRole("dialog", { name: "Cart" })).toBe(overlay);
    expect(document.querySelector(".cart-sheet")).toBe(panel);
    expect(overlay).toHaveAttribute("data-state", "open");
    expect(panel).toHaveAttribute("data-state", "open");
    expect(document.querySelectorAll(".cart-sheet")).toHaveLength(1);
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("keeps the persistent drawer through exit and ignores stale completion", () => {
    const returnFocus = vi.fn();
    const { rerender } = render(
      <Drawer open onClose={() => {}} returnFocus={returnFocus} />,
    );
    const overlay = document.querySelector(".cart-sheet-overlay");
    const panel = document.querySelector(".cart-sheet");

    rerender(
      <Drawer open={false} onClose={() => {}} returnFocus={returnFocus} />,
    );
    expect(overlay).toHaveAttribute("data-state", "closed");
    expect(panel).toHaveAttribute("data-state", "closed");
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(returnFocus).toHaveBeenCalledTimes(1);

    rerender(
      <Drawer open onClose={() => {}} returnFocus={returnFocus} />,
    );
    finishTransformTransition(panel!);
    expect(overlay).toHaveAttribute("data-state", "open");
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(document.querySelectorAll(".cart-sheet")).toHaveLength(1);

    rerender(
      <Drawer open={false} onClose={() => {}} returnFocus={returnFocus} />,
    );
    finishTransformTransition(panel!);
    expect(overlay).toHaveAttribute("data-state", "closed");
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
    expect(returnFocus).toHaveBeenCalledTimes(2);
  });

  it("restores existing body styles only after the exit transition", () => {
    document.body.style.overflow = "auto";
    document.body.style.paddingRight = "4px";
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(
      window.innerWidth - 16,
    );
    const { rerender } = render(<Drawer open onClose={() => {}} />);

    expect(document.body).toHaveStyle({
      overflow: "hidden",
      paddingRight: "20px",
    });
    expect(document.body).toHaveAttribute("data-sheet-scroll-lock");
    expect(document.body.style.getPropertyValue("--sheet-scrollbar-width")).toBe(
      "16px",
    );

    rerender(<Drawer open={false} onClose={() => {}} />);
    expect(document.body).toHaveStyle({
      overflow: "hidden",
      paddingRight: "20px",
    });

    finishTransformTransition(document.querySelector(".cart-sheet")!);
    expect(document.body).toHaveStyle({
      overflow: "auto",
      paddingRight: "4px",
    });
    expect(document.body).not.toHaveAttribute("data-sheet-scroll-lock");
    expect(document.body.style.getPropertyValue("--sheet-scrollbar-width")).toBe(
      "",
    );
  });

  it("releases scroll lock immediately when reduced motion is active", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const { rerender } = render(<Drawer open onClose={() => {}} />);

    expect(document.body).toHaveStyle({ overflow: "hidden" });
    rerender(<Drawer open={false} onClose={() => {}} />);

    expect(document.querySelector(".cart-sheet-overlay")).toHaveAttribute(
      "data-state",
      "closed",
    );
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
  });

  it("uses the same close callback for the button, overlay, and Escape", () => {
    const onClose = vi.fn();
    render(<Drawer open onClose={onClose} />);

    const dialog = screen.getByRole("dialog", { name: "Cart" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.mouseDown(dialog);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
