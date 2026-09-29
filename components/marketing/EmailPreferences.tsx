"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./EmailPreferences.module.css";

type Submission =
  | { kind: "idle" | "pending"; message: "" }
  | { kind: "success" | "error"; message: string };

export function EmailPreferences({
  confirmToken,
  unsubscribeToken,
}: {
  confirmToken?: string;
  unsubscribeToken?: string;
}) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [submission, setSubmission] = useState<Submission>({
    kind: "idle",
    message: "",
  });
  const [withdrawnScope, setWithdrawnScope] = useState<
    "welcome" | "all" | null
  >(null);
  const inFlight = useRef(false);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const pending = submission.kind === "pending";

  useEffect(() => {
    if (submission.kind === "success") resultRef.current?.focus();
  }, [submission]);

  async function submit(
    path: string,
    body: Record<string, string | boolean>,
    successMessage: string,
  ) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSubmission({ kind: "pending", message: "" });
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
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
            response.status === 400 && (confirmToken || unsubscribeToken)
              ? "This email link is invalid or has expired. Please use the link in your most recent helix email."
              : response.status === 429
                ? "Please wait a few minutes before trying again."
                : "Email preferences are temporarily unavailable. Please try again.",
        });
        return false;
      }
      setSubmission({ kind: "success", message: successMessage });
      return true;
    } catch {
      setSubmission({
        kind: "error",
        message:
          "Email preferences are temporarily unavailable. Please try again.",
      });
      return false;
    } finally {
      inFlight.current = false;
    }
  }

  async function withdraw(scope: "welcome" | "all") {
    if (!unsubscribeToken) return;
    const changed = await submit(
      "/api/marketing/preferences",
      { token: unsubscribeToken, scope },
      scope === "welcome"
        ? "Welcome emails have been stopped."
        : "You have unsubscribed from marketing emails.",
    );
    if (changed) setWithdrawnScope(scope);
  }

  if (unsubscribeToken) {
    return (
      <section
        className={styles.panel}
        aria-labelledby="email-preferences-heading"
      >
        <p className="eyebrow">helix emails</p>
        <h1 id="email-preferences-heading">Email preferences</h1>
        <p className={styles.intro}>
          Choose which marketing emails to stop. Order, account, and support
          emails are unaffected.
        </p>
        <div className={styles.form}>
          {!withdrawnScope && (
            <button
              type="button"
              className="btn btn--editorial-rounded btn--ghost"
              disabled={pending}
              onClick={() => void withdraw("welcome")}
            >
              Stop welcome emails
            </button>
          )}
          {withdrawnScope !== "all" && (
            <button
              type="button"
              className="btn btn--editorial-rounded"
              disabled={pending}
              onClick={() => void withdraw("all")}
            >
              Unsubscribe from marketing
            </button>
          )}
          <p
            ref={resultRef}
            tabIndex={-1}
            className={styles.result}
            role={submission.kind === "error" ? "alert" : "status"}
          >
            {pending ? "Updating your email preferences…" : submission.message}
          </p>
          <p className={styles.note}>
            A message already on its way may still arrive.
          </p>
        </div>
      </section>
    );
  }

  function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity() || !consent) return;
    void submit(
      "/api/marketing/subscription",
      { email, consent: true },
      "If this address is eligible, check your inbox to confirm.",
    );
  }

  if (confirmToken) {
    return (
      <section
        className={styles.panel}
        aria-labelledby="email-preferences-heading"
      >
        <p className="eyebrow">helix emails</p>
        <h1 id="email-preferences-heading">Confirm your subscription</h1>
        <p className={styles.intro}>
          Confirm that you want to receive helix marketing emails, including our
          welcome series and skincare education.
        </p>
        <div className={styles.form}>
          {submission.kind !== "success" && (
            <button
              type="button"
              className="btn btn--editorial-rounded"
              disabled={pending}
              onClick={() =>
                void submit(
                  "/api/marketing/confirm",
                  { token: confirmToken },
                  "Your subscription is confirmed. Existing email opt-outs still apply.",
                )
              }
            >
              {pending ? "Confirming…" : "Confirm subscription"}
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
          <p className={styles.note}>
            <Link href="/email-preferences">
              Request a new subscription link
            </Link>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={styles.panel}
      aria-labelledby="email-preferences-heading"
    >
      <p className="eyebrow">helix emails</p>
      <h1 id="email-preferences-heading">Stay in the know</h1>
      <p className={styles.intro}>
        Sign up for our welcome series and skincare education. You can
        unsubscribe at any time.
      </p>
      <form className={styles.form} onSubmit={subscribe}>
        <label className={styles.field}>
          <span>Email address</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setSubmission({ kind: "idle", message: "" });
            }}
            disabled={pending}
          />
        </label>
        <label className={styles.consent}>
          <input
            type="checkbox"
            name="consent"
            required
            checked={consent}
            onChange={(event) => {
              setConsent(event.target.checked);
              setSubmission({ kind: "idle", message: "" });
            }}
            disabled={pending}
          />
          <span>
            I want to receive helix marketing emails, including a welcome series
            and skincare education. I can unsubscribe at any time.
          </span>
        </label>
        <p className={styles.note}>
          Read our <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <button
          type="submit"
          className="btn btn--editorial-rounded"
          disabled={pending}
        >
          {pending ? "Submitting…" : "Subscribe"}
        </button>
        <p
          ref={resultRef}
          tabIndex={-1}
          className={styles.result}
          role={submission.kind === "error" ? "alert" : "status"}
        >
          {submission.message}
        </p>
        <p className={styles.note}>
          Already subscribed? Use the preferences link in your most recent helix
          marketing email to change what you receive.
        </p>
      </form>
    </section>
  );
}
