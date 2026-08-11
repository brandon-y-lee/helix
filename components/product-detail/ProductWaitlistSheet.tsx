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
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({
    kind: "idle",
    message: "",
  });
  const initialFocus = useCallback(() => emailRef.current, []);

  useEffect(() => {
    setEmail("");
    setMarketingConsent(false);
    setSubmission({ kind: "idle", message: "" });
  }, [productId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.kind === "pending") return;
    if (!emailRef.current?.checkValidity()) {
      emailRef.current?.reportValidity();
      return;
    }

    setSubmission({ kind: "pending", message: "Joining the waitlist." });
    try {
      const response = await fetch("/api/product-waitlist", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId,
          email,
          marketingConsent,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: { message?: string };
          }
        | null;

      if (!response.ok || payload?.ok !== true) {
        setSubmission({
          kind: "error",
          message:
            payload?.error?.message ??
            "The waitlist is temporarily unavailable. Try again.",
        });
        return;
      }

      setSubmission({
        kind: "success",
        message: `You're on the waitlist for ${productName}.`,
      });
    } catch {
      setSubmission({
        kind: "error",
        message: "The waitlist is temporarily unavailable. Try again.",
      });
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
          Register your interest. We’ll confirm the request here without
          promising launch timing, price, or access priority.
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
              I’d also like to receive Mei Pelle marketing emails. Optional.
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
      </div>
    </Sheet>
  );
}
