"use client";
import { useEffect } from "react";
/** No local identifier or browsing history; server accepts only confirmed subscribers. */
export function LifecycleProductVisit({ productSlug }: { productSlug: string }) {
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/marketing/activity", {
        method: "POST", credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ productSlug }), signal: controller.signal,
      }).catch(() => { /* Optional reminders must never interrupt product browsing. */ });
    }, 5000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [productSlug]);
  return null;
}
