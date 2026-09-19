"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const TERMINAL_STATES = new Set([
  "paid", "failed", "cancelled", "partially_refunded", "refunded", "exception", "unavailable",
]);

function delayFromSeconds(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(120000, value * 1000)
    : 0;
}

function retryAfterDelay(header: string | null): number {
  if (!header) return 0;
  const seconds = Number(header);
  return Number.isFinite(seconds)
    ? delayFromSeconds(seconds)
    : delayFromSeconds((Date.parse(header) - Date.now()) / 1000);
}

export function OrderStatusRefresh({ retryAfterSeconds }: { retryAfterSeconds: number }) {
  const router = useRouter();
  const [message, setMessage] = useState("Checking for payment confirmation.");
  const deadline = useRef<number | null>(null);
  const finished = useRef(false);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId || finished.current) return;
    deadline.current ??= Date.now() + 120000;
    let controller: AbortController | null = null;
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = Math.max(5000, delayFromSeconds(retryAfterSeconds));

    function stopAtDeadline() {
      stopped = true;
      finished.current = true;
      clearTimeout(timer);
      controller?.abort();
      setMessage("Automatic checking has paused. Refresh this page to check again.");
    }
    const deadlineTimer = setTimeout(stopAtDeadline, Math.max(0, deadline.current - Date.now()));

    function schedule() {
      clearTimeout(timer);
      if (!stopped && document.visibilityState !== "hidden") timer = setTimeout(check, delay);
    }

    async function check() {
      if (stopped || inFlight || document.visibilityState === "hidden") return;
      if (Date.now() >= deadline.current!) return stopAtDeadline();
      inFlight = true;
      controller = new AbortController();
      const requestTimeout = setTimeout(() => controller?.abort(), 10000);
      let serverDelay = 0;
      try {
        const response = await fetch(`/api/checkout/status?session_id=${encodeURIComponent(sessionId!)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
          credentials: "same-origin",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });
        serverDelay = retryAfterDelay(response.headers.get("retry-after"));
        const result: unknown = await response.json();
        if (stopped) return;
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const status = result && typeof result === "object" && "status" in result ? result.status : null;
        if (result && typeof result === "object" && "retryAfterSeconds" in result) {
          serverDelay = Math.max(serverDelay, delayFromSeconds(result.retryAfterSeconds));
        }
        if (typeof status === "string" && TERMINAL_STATES.has(status) && (response.ok || response.status === 404)) {
          stopped = true;
          finished.current = true;
          clearTimeout(deadlineTimer);
          setMessage("Payment status changed. Updating your Order.");
          router.refresh();
          return;
        }
      } catch {
        // A temporary network failure is not a payment outcome.
      } finally {
        clearTimeout(requestTimeout);
        inFlight = false;
      }
      if (!stopped) {
        delay = Math.max(serverDelay, Math.min(30000, delay * 2));
        schedule();
      }
    }
    function onVisibilityChange() {
      if (stopped) return;
      if (document.visibilityState === "hidden") {
        clearTimeout(timer);
        controller?.abort();
        setMessage("Automatic checking is paused while this tab is hidden.");
      } else {
        setMessage("Checking for payment confirmation.");
        schedule();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(deadlineTimer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [retryAfterSeconds, router]);

  return <p className="form-status" role="status">{message}</p>;
}
