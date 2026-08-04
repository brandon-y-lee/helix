"use client";

import { CartView } from "@/components/cart/CartView";
import { useCartDrawer } from "@/components/cart/CartProvider";
import { Sheet } from "@/components/overlays/Sheet";
import type { SheetMotionTransition } from "@/components/overlays/Sheet";
import {
  PDP_SLIDE_DURATION_MS,
  PDP_SLIDE_EASING_VALUES,
} from "@/components/product-detail/usePdpSlideTransition";

export const CART_SHEET_MOTION: SheetMotionTransition = {
  duration: PDP_SLIDE_DURATION_MS / 1000,
  ease: [...PDP_SLIDE_EASING_VALUES],
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
    >
      <CartView mode="drawer" onContinue={onClose} />
    </Sheet>
  );
}
