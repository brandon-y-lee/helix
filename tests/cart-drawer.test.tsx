import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CART_SHEET_MOTION,
  CartDrawer,
} from "@/components/cart/CartDrawer";
import {
  PDP_SLIDE_DURATION_MS,
  PDP_SLIDE_EASING,
} from "@/components/product-detail/usePdpSlideTransition";

const motionPreference = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => motionPreference.reduced,
  };
});

vi.mock("@/components/cart/CartView", () => ({
  CartView: () => <div>Cart contents</div>,
}));

afterEach(() => {
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
  document.body.style.removeProperty("--sheet-scrollbar-width");
  document.body.removeAttribute("data-sheet-scroll-lock");
  motionPreference.reduced = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
  it("mounts one Motion drawer with the shared PDP timing", () => {
    const { rerender } = render(<Drawer open={false} onClose={() => {}} />);

    expect(document.querySelector(".cart-sheet-overlay")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Cart" })).toBeNull();

    rerender(<Drawer open onClose={() => {}} />);

    const overlay = screen.getByRole("dialog", { name: "Cart" });
    const panel = document.querySelector(".cart-sheet");
    expect(overlay).toHaveAttribute("data-motion-sheet");
    expect(overlay).toHaveAttribute("data-state", "open");
    expect(panel).toHaveAttribute("data-state", "open");
    expect(panel).toHaveStyle({ transform: "translateX(100%)" });
    expect(document.querySelectorAll(".cart-sheet")).toHaveLength(1);
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(CART_SHEET_MOTION).toEqual({
      duration: PDP_SLIDE_DURATION_MS / 1000,
      ease: [0.66, 0, 0.18, 1],
    });
    expect(PDP_SLIDE_EASING).toBe("cubic-bezier(0.66, 0, 0.18, 1)");
  });

  it("keeps the drawer through exit and reverses a rapid reopen", async () => {
    motionPreference.reduced = true;
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
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(overlay).toHaveAttribute("inert");
    expect(panel).toHaveAttribute("data-state", "closed");
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(returnFocus).not.toHaveBeenCalled();

    rerender(
      <Drawer open onClose={() => {}} returnFocus={returnFocus} />,
    );
    expect(overlay).toHaveAttribute("data-state", "open");
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(document.querySelectorAll(".cart-sheet")).toHaveLength(1);
    expect(returnFocus).not.toHaveBeenCalled();

    rerender(
      <Drawer open={false} onClose={() => {}} returnFocus={returnFocus} />,
    );
    await waitFor(() => {
      expect(document.querySelector(".cart-sheet-overlay")).toBeNull();
    });
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
    expect(returnFocus).toHaveBeenCalledTimes(1);
  });

  it("restores existing body styles after Motion completes exit", async () => {
    motionPreference.reduced = true;
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

    await waitFor(() => {
      expect(document.querySelector(".cart-sheet-overlay")).toBeNull();
      expect(document.body).toHaveStyle({
        overflow: "auto",
        paddingRight: "4px",
      });
    });
    expect(document.body).not.toHaveAttribute("data-sheet-scroll-lock");
    expect(document.body.style.getPropertyValue("--sheet-scrollbar-width")).toBe(
      "",
    );
  });

  it("releases scroll lock nearly immediately for reduced motion", async () => {
    motionPreference.reduced = true;
    const { rerender } = render(<Drawer open onClose={() => {}} />);

    expect(document.body).toHaveStyle({ overflow: "hidden" });
    rerender(<Drawer open={false} onClose={() => {}} />);

    await waitFor(() => {
      expect(document.querySelector(".cart-sheet-overlay")).toBeNull();
      expect(document.body).not.toHaveStyle({ overflow: "hidden" });
    });
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
