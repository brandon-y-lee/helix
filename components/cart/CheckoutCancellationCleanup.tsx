"use client";

import { useEffect } from "react";

export function CheckoutCancellationCleanup({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;

    const controller = new AbortController();
    void fetch("/cart/checkout-cancel", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    }).catch(() => undefined);

    return () => controller.abort();
  }, [active]);

  return null;
}
