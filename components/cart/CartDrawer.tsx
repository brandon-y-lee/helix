"use client";

import { CartView } from "@/components/cart/CartView";
import { useCartDrawer } from "@/components/cart/CartProvider";
import {
  PERSISTENT_SHEET_MOTION_TRANSITION,
  Sheet,
} from "@/components/overlays/Sheet";

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
      motionTransition={PERSISTENT_SHEET_MOTION_TRANSITION}
      persistent
    >
      <CartView mode="drawer" onContinue={onClose} />
    </Sheet>
  );
}
