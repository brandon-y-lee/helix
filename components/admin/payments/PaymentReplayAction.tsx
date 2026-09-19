"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PaymentReplayInput } from "@/lib/admin/payments/types";

type ReplayAttempt = Omit<PaymentReplayInput, "dryRun">;

export function PaymentReplayAction({ itemId, version }: { itemId: string; version: number }) {
  return <ReplayForm key={`${itemId}:${version}`} itemId={itemId} version={version} />;
}

function ReplayForm({ itemId, version }: { itemId: string; version: number }) {
  const router = useRouter();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [attempt, setAttempt] = useState<ReplayAttempt | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [uncertainApply, setUncertainApply] = useState(false);
  const [message, setMessage] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const validReason = reason.trim().length >= 10 && reason.length <= 240 && !/[\u0000-\u001f\u007f]/.test(reason);

  useEffect(() => () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);

  useEffect(() => {
    if (queued) statusRef.current?.focus();
  }, [queued]);

  async function request(dryRun: boolean) {
    if (activeRequest.current || queued || blocked || !validReason || (!dryRun && (!reviewed || !attempt))) return;
    if (dryRun) setReviewed(false);
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    setBusy(true);
    setMessage(dryRun ? "Inspecting this event version…" : "Queuing the inspected event…");
    try {
      const command = attempt ?? { itemId, expectedVersion: version, reason: reason.trim(), requestId: crypto.randomUUID() };
      setAttempt(command);
      const response = await fetch("/api/admin/payments/replay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...command, dryRun }), credentials: "same-origin",
        cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal,
      });
      if (activeRequest.current !== controller) return;
      if (controller.signal.aborted) throw new Error("timeout");
      if (response.status === 401 || response.status === 403 || response.status === 409) {
        setReviewed(false);
        setAttempt(null);
        setBlocked(true);
        setUncertainApply(false);
        setMessage(response.status === 409
          ? "This event changed or is no longer eligible. Refresh the page and inspect its current state."
          : "Payment access has changed. Refresh the page to verify access before trying again.");
        return;
      }
      if (!response.ok) throw new Error("unavailable");
      const result: unknown = await response.json();
      if (activeRequest.current !== controller) return;
      if (controller.signal.aborted) throw new Error("timeout");
      if (!result || typeof result !== "object" || !("itemId" in result) || result.itemId !== command.itemId
        || !("version" in result) || !Number.isSafeInteger(result.version) || (result.version as number) < 1
        || !("status" in result) || result.version !== command.expectedVersion + (dryRun ? 0 : 1)) {
        throw new Error("unavailable");
      }
      if (dryRun && result.status === "eligible") {
        setReviewed(true);
        setUncertainApply(false);
        setMessage("Inspection passed. Review the reason, then queue this event for recovery.");
      } else if (!dryRun && (result.status === "applied" || result.status === "duplicate")) {
        setReviewed(false);
        setQueued(true);
        setMessage(`${result.status === "duplicate" ? "Replay was already queued" : "Replay queued"}. This action does not confirm payment. Refreshing current state.`);
        router.refresh();
      } else throw new Error("unavailable");
    } catch {
      if (activeRequest.current !== controller) return;
      setUncertainApply(!dryRun);
      setMessage(dryRun ? "Inspection could not be confirmed. Try the inspection again."
        : "Replay outcome could not be confirmed. Retry replay using the same reviewed request.");
    } finally {
      window.clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <form className="payment-replay" onSubmit={(event) => { event.preventDefault(); void request(true); }}>
      {!queued && <>
        <label htmlFor={reasonId}>Replay reason</label>
        <input id={reasonId} value={reason} minLength={10} maxLength={240} required disabled={busy || blocked}
          onChange={(event) => {
            setReason(event.target.value);
            setAttempt(null);
            setReviewed(false);
            setUncertainApply(false);
            setMessage("");
          }} aria-describedby={`${reasonId}-help`} />
        <p id={`${reasonId}-help`} className="payment-operations__note">Use 10–240 characters. Do not include customer details or secrets.</p>
        <div className="payment-replay__actions">
          {!reviewed && <button type="submit" disabled={busy || blocked || !validReason}>{busy ? "Inspecting…" : "Inspect replay"}</button>}
          {reviewed && <button type="button" disabled={busy} onClick={() => void request(false)}>{busy ? "Queuing…" : uncertainApply ? "Retry replay" : "Queue replay"}</button>}
        </div>
      </>}
      <p role="status" aria-live="polite" tabIndex={-1} ref={statusRef}>{message}</p>
    </form>
  );
}
