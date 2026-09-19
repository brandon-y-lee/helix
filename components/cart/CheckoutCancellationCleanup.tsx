"use client";

import { useState } from "react";

type CancellationState = "idle" | "pending" | "cancelled" | "paid" | "processing" | "unavailable" | "error";

export function CheckoutCancellationCleanup({ active }: { active: boolean }) {
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
        body: "{}",
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
    } catch {
      setState("error");
    }
  }

  return (
    <div>
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
        {state === "cancelled" && "Sandbox checkout was cancelled."}
        {state === "paid" && "This checkout has already completed."}
        {state === "processing" && "This payment is still processing. Try again shortly."}
        {state === "unavailable" && "No pending checkout is available to cancel."}
        {state === "error" && "We couldn't cancel checkout. Try again in a moment."}
      </p>
    </div>
  );
}
