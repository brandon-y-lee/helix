"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  PERSISTENT_SHEET_MOTION_TRANSITION,
  Sheet,
} from "@/components/overlays/Sheet";
import styles from "@/components/waitlist/ProductNotifications.module.css";

type SubmissionState =
  | { kind: "idle"; message: "" }
  | { kind: "pending"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function ProductWaitlistSheet({
  open,
  productId,
  productName,
  onClose,
  returnFocus,
}: {
  open: boolean;
  productId: string;
  productName: string;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const emailRef = useRef<HTMLInputElement>(null);
  const attempt = useRef<{ payload: string; id: string } | null>(null);
  const inFlight = useRef(false);
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({
    kind: "idle",
    message: "",
  });
  const initialFocus = useCallback(() => emailRef.current, []);

  useEffect(() => {
    attempt.current = null;
    setEmail("");
    setMarketingConsent(false);
    setSubmission({ kind: "idle", message: "" });
  }, [productId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!emailRef.current?.checkValidity()) {
      emailRef.current?.reportValidity();
      return;
    }

    inFlight.current = true;
    setSubmission({ kind: "pending", message: "Submitting your request." });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const payload = { productId, email, marketingConsent };
      const fingerprint = JSON.stringify(payload);
      if (attempt.current?.payload !== fingerprint) {
        attempt.current = { payload: fingerprint, id: crypto.randomUUID() };
      }
      const response = await fetch("/api/product-waitlist", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: attempt.current.id }),
        signal: controller.signal,
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: { message?: string };
      } | null;

      if (!response.ok || result?.ok !== true) {
        setSubmission({
          kind: "error",
          message:
            result?.error?.message ??
            "The waitlist is temporarily unavailable. Try again.",
        });
        return;
      }

      attempt.current = null;
      setSubmission({
        kind: "success",
        message: `Your Product notification request for ${productName} was received.${marketingConsent ? " If eligible, check your inbox to confirm marketing emails separately." : ""}`,
      });
    } catch {
      setSubmission({
        kind: "error",
        message: "The waitlist is temporarily unavailable. Try again.",
      });
    } finally {
      window.clearTimeout(timeout);
      inFlight.current = false;
    }
  }

  return (
    <Sheet
      open={open}
      title={`Join the ${productName} waitlist`}
      eyebrow="Product waitlist"
      description={`Register interest in ${productName}. No launch timing, price, or access priority is promised.`}
      onClose={onClose}
      returnFocus={returnFocus}
      initialFocus={initialFocus}
      className="product-waitlist-sheet"
      overlayClassName="product-waitlist-overlay"
      motionTransition={PERSISTENT_SHEET_MOTION_TRANSITION}
    >
      <div className="product-waitlist-sheet__body">
        <p className="product-waitlist-sheet__intro">
          Request one notification when this Product becomes available to buy.
          Your request expires 12 months after enrollment. No launch timing,
          price, or access priority is promised.
        </p>
        <p className="product-waitlist-sheet__intro">
          During development, emails can reach only approved test recipients.
        </p>
        <form className="product-waitlist-form" onSubmit={submit} noValidate>
          <label className="product-waitlist-form__field">
            <span>Email address</span>
            <input
              ref={emailRef}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (submission.kind !== "idle") {
                  setSubmission({ kind: "idle", message: "" });
                }
              }}
              disabled={submission.kind === "pending"}
            />
          </label>
          <label className="product-waitlist-form__consent">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(event) => setMarketingConsent(event.target.checked)}
              disabled={submission.kind === "pending"}
            />
            <span>
              I’d also like to receive helix marketing emails. Optional.
            </span>
          </label>
          <button
            type="submit"
            className="btn product-waitlist-form__submit"
            disabled={submission.kind === "pending"}
          >
            {submission.kind === "pending" ? "Joining" : "Join the waitlist"}
          </button>
          {submission.kind === "error" ? (
            <p className="product-waitlist-form__result" role="alert">
              {submission.message}
            </p>
          ) : (
            <p
              className="product-waitlist-form__result"
              role="status"
              aria-live="polite"
            >
              {submission.message}
            </p>
          )}
        </form>
        <p className="product-waitlist-sheet__intro">
          <a className={styles.managementLink} href="/product-notifications">
            Manage Product notifications
          </a>{" "}
          independently of marketing emails.
        </p>
      </div>
    </Sheet>
  );
}
