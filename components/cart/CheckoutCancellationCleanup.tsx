"use client";

import { useState } from "react";
import { useCart } from "@/components/cart/useCart";

type CancellationState = "idle" | "pending" | "cancelled" | "paid" | "processing" | "unavailable" | "error";

export function CheckoutCancellationCleanup({ active, recoverOriginChange = false, onCancelled }: {
  active: boolean; recoverOriginChange?: boolean; onCancelled?: () => void;
}) {
  const { refresh } = useCart();
  const [state, setState] = useState<CancellationState>("idle");
  if (!active) return null;
  const terminal = state === "cancelled" || state === "paid" || state === "unavailable";

  async function cancelCheckout() {
    if (state === "pending" || terminal) return;
    setState("pending");
    try {
      const response = await fetch("/cart/checkout-cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: recoverOriginChange ? JSON.stringify({ recoverOriginChange: true }) : "{}",
        cache: "no-store",
        credentials: "same-origin",
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        !result ||
        typeof result !== "object" ||
        !("status" in result) ||
        (result.status !== "cancelled" && result.status !== "paid" &&
          result.status !== "processing" && result.status !== "unavailable")
      ) {
        throw new Error("Cancellation could not be verified");
      }
      setState(result.status);
      if (result.status === "cancelled" || result.status === "paid") {
        void refresh();
        if (result.status === "cancelled") onCancelled?.();
      }
    } catch {
      setState("error");
    }
  }

  return (
    <div>
      {recoverOriginChange && (
        <p className="checkout-panel__hint">
          Changing or clearing your cart doesn’t close an earlier checkout.
          {" "}Choose Cancel pending checkout below; once cancellation is confirmed, try checkout again.
        </p>
      )}
      <button
        type="button"
        className="link-button"
        disabled={state === "pending" || terminal}
        aria-busy={state === "pending" || undefined}
        onClick={() => void cancelCheckout()}
      >
        {state === "pending" ? "Cancelling checkout" : "Cancel pending checkout"}
      </button>
      <p role="status" aria-live="polite">
        {state === "pending" && "Checking pending checkout…"}
        {state === "cancelled" && "Checkout was cancelled."}
        {state === "paid" && "This checkout has already completed."}
        {state === "processing" && (recoverOriginChange
          ? "This checkout still needs verification. Try again shortly; contact support if it remains blocked."
          : "This payment is still processing. Try again shortly.")}
        {state === "unavailable" && "No pending checkout is available to cancel."}
        {state === "error" && "We couldn't cancel checkout. Try again in a moment."}
      </p>
    </div>
  );
}
