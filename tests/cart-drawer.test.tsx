import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartDrawer } from "@/components/CartDrawer";
import {
  PDP_SLIDE_DURATION_MS,
  PDP_SLIDE_EASING,
} from "@/components/usePdpSlideTransition";

vi.mock("@/components/CartView", () => ({
  CartView: () => <div>Cart contents</div>,
}));

let animationFrames: FrameRequestCallback[];

beforeEach(() => {
  animationFrames = [];
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
  document.body.style.removeProperty("--sheet-scrollbar-width");
  document.body.removeAttribute("data-sheet-scroll-lock");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function advanceEntryFrame() {
  const callback = animationFrames.shift();
  expect(callback).toBeTypeOf("function");
  act(() => callback?.(0));
}

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
  it("stages entry before opening with the shared PDP slide timing", () => {
    render(<Drawer open onClose={() => {}} />);

    const dialog = screen.getByRole("dialog", { name: "Cart" });
    const panel = dialog.querySelector(".cart-sheet");

    expect(dialog).toHaveAttribute("data-state", "open");
    expect(dialog).toHaveAttribute("data-motion-state", "starting");
    expect(dialog).toHaveStyle({
      "--pdp-slide-duration": `${PDP_SLIDE_DURATION_MS}ms`,
      "--pdp-slide-easing": PDP_SLIDE_EASING,
    });
    expect(panel).toHaveAttribute("data-motion-state", "starting");
    expect(panel).toHaveStyle({
      "--pdp-slide-duration": `${PDP_SLIDE_DURATION_MS}ms`,
      "--pdp-slide-easing": PDP_SLIDE_EASING,
    });

    advanceEntryFrame();

    expect(dialog).toHaveAttribute("data-motion-state", "open");
    expect(panel).toHaveAttribute("data-motion-state", "open");
  });

  it("stays present through exit and ignores stale completion after reopening", () => {
    const returnFocus = vi.fn();
    const { rerender } = render(
      <Drawer open onClose={() => {}} returnFocus={returnFocus} />,
    );
    advanceEntryFrame();

    rerender(
      <Drawer open={false} onClose={() => {}} returnFocus={returnFocus} />,
    );
    const closingDialog = document.querySelector(".cart-sheet-overlay");
    const closingPanel = document.querySelector(".cart-sheet");
    expect(closingDialog).toHaveAttribute("data-state", "closed");
    expect(closingDialog).toHaveAttribute("data-motion-state", "closed");
    expect(closingPanel).toHaveAttribute("data-motion-state", "closed");
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(returnFocus).toHaveBeenCalledTimes(1);

    rerender(
      <Drawer open onClose={() => {}} returnFocus={returnFocus} />,
    );
    expect(closingPanel).toHaveAttribute("data-motion-state", "open");
    finishTransformTransition(closingPanel!);
    expect(screen.getByRole("dialog", { name: "Cart" })).toHaveAttribute(
      "data-state",
      "open",
    );

    rerender(
      <Drawer open={false} onClose={() => {}} returnFocus={returnFocus} />,
    );
    finishTransformTransition(document.querySelector(".cart-sheet")!);
    expect(document.querySelector(".cart-sheet-overlay")).toBeNull();
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
    expect(returnFocus).toHaveBeenCalledTimes(2);
  });

  it("does not leave presence behind when closed before entry starts", () => {
    const { rerender } = render(<Drawer open onClose={() => {}} />);

    expect(screen.getByRole("dialog", { name: "Cart" })).toHaveAttribute(
      "data-motion-state",
      "starting",
    );
    rerender(<Drawer open={false} onClose={() => {}} />);

    expect(document.querySelector(".cart-sheet-overlay")).toBeNull();
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
  });

  it("restores existing body styles only after the exit transition", () => {
    document.body.style.overflow = "auto";
    document.body.style.paddingRight = "4px";
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(
      window.innerWidth - 16,
    );
    const { rerender } = render(<Drawer open onClose={() => {}} />);
    advanceEntryFrame();

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

  it("unmounts without waiting for a transition when reduced motion is active", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true }),
    );
    const { rerender } = render(<Drawer open onClose={() => {}} />);

    expect(screen.getByRole("dialog", { name: "Cart" })).toHaveAttribute(
      "data-motion-state",
      "open",
    );
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    rerender(<Drawer open={false} onClose={() => {}} />);

    expect(document.querySelector(".cart-sheet-overlay")).toBeNull();
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
