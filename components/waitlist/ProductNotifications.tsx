"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import styles from "./ProductNotifications.module.css";

type Submission =
  | { kind: "idle" | "pending"; message: "" }
  | { kind: "success" | "error"; message: string };

export function ProductNotifications({
  cancelToken,
}: {
  cancelToken?: string;
}) {
  const [email, setEmail] = useState("");
  const [submission, setSubmission] = useState<Submission>({
    kind: "idle",
    message: "",
  });
  const attempt = useRef<{ email: string; id: string } | null>(null);
  const inFlight = useRef(false);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const pending = submission.kind === "pending";

  useEffect(() => {
    if (submission.kind === "success") resultRef.current?.focus();
  }, [submission]);

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmission({ kind: "pending", message: "" });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      if (!cancelToken && attempt.current?.email !== email)
        attempt.current = { email, id: crypto.randomUUID() };
      const response = await fetch(
        `/api/product-notifications/${cancelToken ? "cancel" : "recovery"}`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            cancelToken
              ? { token: cancelToken }
              : { email, requestId: attempt.current?.id },
          ),
          signal: controller.signal,
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (
        !response.ok ||
        !payload ||
        typeof payload !== "object" ||
        !("ok" in payload) ||
        payload.ok !== true
      ) {
        setSubmission({
          kind: "error",
          message:
            cancelToken && response.status === 400
              ? "This cancellation link is invalid or has expired. Request new links below."
              : "Product notification management is temporarily unavailable. Please try again.",
        });
        return;
      }
      attempt.current = null;
      setSubmission({
        kind: "success",
        message: cancelToken
          ? "Your cancellation request has been processed."
          : "If this address is eligible, check your inbox for private cancellation links.",
      });
    } catch {
      setSubmission({
        kind: "error",
        message:
          "Product notification management is temporarily unavailable. Please try again.",
      });
    } finally {
      window.clearTimeout(timeout);
      inFlight.current = false;
    }
  }

  function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (event.currentTarget.reportValidity()) void submit();
  }

  if (cancelToken)
    return (
      <section
        className={styles.panel}
        aria-labelledby="product-notifications-heading"
      >
        <p className="eyebrow">helix emails</p>
        <h1 id="product-notifications-heading">Cancel Product notification</h1>
        <p className={styles.intro}>
          Cancel the Product availability notification associated with this
          private link. Your marketing preferences are unchanged.
        </p>
        <div className={styles.form}>
          {submission.kind !== "success" && (
            <button
              type="button"
              className="btn btn--editorial-rounded"
              disabled={pending}
              onClick={() => void submit()}
            >
              {pending ? "Cancelling…" : "Cancel Product notification"}
            </button>
          )}
          <p
            ref={resultRef}
            tabIndex={-1}
            className={styles.result}
            role={submission.kind === "error" ? "alert" : "status"}
          >
            {submission.message}
          </p>
        </div>
        <p className={styles.note}>
          A message already on its way may still arrive.
        </p>
        <p className={styles.note}>
          <a href="/product-notifications">Request new cancellation links</a>
        </p>
        <p className={styles.note}>
          <Link href="/">Return to helix</Link>
        </p>
      </section>
    );

  return (
    <section
      className={styles.panel}
      aria-labelledby="product-notifications-heading"
    >
      <p className="eyebrow">helix emails</p>
      <h1 id="product-notifications-heading">Product notifications</h1>
      <p className={styles.intro}>
        Request private links to cancel your Product availability notifications.
        Your marketing preferences are separate.
      </p>
      <form className={styles.form} onSubmit={recover}>
        <label className={styles.field}>
          <span>Email address</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={254}
            value={email}
            disabled={pending}
            onChange={(event) => {
              setEmail(event.target.value);
              setSubmission({ kind: "idle", message: "" });
            }}
          />
        </label>
        <button
          type="submit"
          className="btn btn--editorial-rounded"
          disabled={pending}
        >
          {pending ? "Requesting links…" : "Email cancellation links"}
        </button>
        <p
          ref={resultRef}
          tabIndex={-1}
          className={styles.result}
          role={submission.kind === "error" ? "alert" : "status"}
        >
          {submission.message}
        </p>
        {submission.kind === "success" && (
          <p className={styles.note}>
            For additional Product requests, request links again after one
            minute.
          </p>
        )}
      </form>
      <p className={styles.note}>
        During development, emails can reach only approved test recipients.
        Requests expire 12 months after enrollment.
      </p>
      <p className={styles.note}>
        <Link href="/">Return to helix</Link>
      </p>
    </section>
  );
}
