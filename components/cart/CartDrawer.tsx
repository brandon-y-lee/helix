"use client";

import { CartView } from "@/components/cart/CartView";
import { useCartDrawer } from "@/components/cart/CartProvider";
import { Sheet } from "@/components/overlays/Sheet";
import type { SheetMotionTransition } from "@/components/overlays/Sheet";

export const CART_SHEET_MOTION: SheetMotionTransition = {
  duration: 0.3,
  ease: [0.42, 0, 0.58, 1],
  backdropDuration: 0.14,
};

export function CartDrawerHost() {
  const {
    cartDrawerOpen,
    closeCartDrawer,
    returnFocusAfterCartDrawerClose,
  } = useCartDrawer();

  return (
    <CartDrawer
      open={cartDrawerOpen}
      onClose={closeCartDrawer}
      returnFocus={returnFocusAfterCartDrawerClose}
    />
  );
}

export function CartDrawer({
  open,
  onClose,
  returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  returnFocus: () => void;
}) {
  return (
    <Sheet
      open={open}
      side="right"
      title="Cart"
      eyebrow="Ritual in progress"
      description="Review and edit your cart."
      onClose={onClose}
      returnFocus={returnFocus}
      className="cart-sheet"
      overlayClassName="cart-sheet-overlay"
      motionTransition={CART_SHEET_MOTION}
      persistent
    >
      <CartView mode="drawer" onContinue={onClose} />
    </Sheet>
  );
}
