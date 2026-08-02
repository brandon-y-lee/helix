import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CartDrawer } from "@/components/CartDrawer";
import {
  PDP_SLIDE_DURATION_MS,
  PDP_SLIDE_EASING,
} from "@/components/usePdpSlideTransition";

vi.mock("@/components/CartView", () => ({
  CartView: ({ onContinue }: { onContinue: () => void }) => (
    <a
      href="/cart"
      onClick={(event) => {
        event.preventDefault();
        onContinue();
      }}
    >
      View cart
    </a>
  ),
}));

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
  it("enters with the shared PDP slide timing", () => {
    render(<Drawer open onClose={() => {}} />);

    const dialog = screen.getByRole("dialog", { name: "Cart" });
    const panel = dialog.querySelector(".cart-sheet");

    expect(dialog).toHaveAttribute("data-state", "open");
    expect(panel).toHaveAttribute("data-state", "open");
    expect(panel).toHaveStyle({
      "--pdp-slide-duration": `${PDP_SLIDE_DURATION_MS}ms`,
      "--pdp-slide-easing": PDP_SLIDE_EASING,
    });
  });

  it("stays present through exit and ignores a stale completion after reopening", () => {
    const returnFocus = vi.fn();
    const { rerender } = render(
      <Drawer open onClose={() => {}} returnFocus={returnFocus} />,
    );

    rerender(
      <Drawer open={false} onClose={() => {}} returnFocus={returnFocus} />,
    );
    const closingDialog = document.querySelector(".cart-sheet-overlay");
    const closingPanel = document.querySelector(".cart-sheet");
    expect(closingDialog).toHaveAttribute("data-state", "closed");
    expect(closingPanel).toHaveAttribute("data-state", "closed");
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(returnFocus).toHaveBeenCalledTimes(1);

    rerender(
      <Drawer open onClose={() => {}} returnFocus={returnFocus} />,
    );
    fireEvent.animationEnd(document.querySelector(".cart-sheet")!);
    expect(screen.getByRole("dialog", { name: "Cart" })).toHaveAttribute(
      "data-state",
      "open",
    );

    rerender(
      <Drawer open={false} onClose={() => {}} returnFocus={returnFocus} />,
    );
    fireEvent.animationEnd(document.querySelector(".cart-sheet")!);
    expect(document.querySelector(".cart-sheet-overlay")).toBeNull();
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
    expect(returnFocus).toHaveBeenCalledTimes(2);
  });

  it("uses the same close callback for the button, overlay, Escape, and navigation", () => {
    const onClose = vi.fn();
    render(<Drawer open onClose={onClose} />);

    const dialog = screen.getByRole("dialog", { name: "Cart" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.mouseDown(dialog);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("link", { name: "View cart" }));

    expect(onClose).toHaveBeenCalledTimes(4);
  });
});
