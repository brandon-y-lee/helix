"use client";

import { CartView } from "@/components/CartView";
import { Sheet } from "@/components/Sheet";

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
    >
      <CartView mode="drawer" onContinue={onClose} />
    </Sheet>
  );
}
