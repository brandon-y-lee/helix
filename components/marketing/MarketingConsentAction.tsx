"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import styles from "./MarketingConsentAction.module.css";

type Submission =
  | { kind: "idle" | "pending"; message: "" }
  | { kind: "success" | "error"; message: string };

type ConsentScope = "welcome" | "lifecycle" | "lifecycle_reviews";

const subscribe = () => () => {};
function allowedActionHost() {
  const { origin, hostname, protocol } = window.location;
  return origin === "https://www.helixskin.us" || origin === "https://helixskin.vercel.app" ||
    (["localhost", "127.0.0.1", "[::1]"].includes(hostname) && ["http:", "https:"].includes(protocol));
}

export function MarketingConsentAction({ action, token, scope }: {
  action: "confirm" | "unsubscribe";
  token: string;
  scope: ConsentScope;
}) {
  const actionable = useSyncExternalStore(subscribe, allowedActionHost, () => false);
  const lifecycle = scope !== "welcome";
  const reviews = scope === "lifecycle_reviews";
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
    body: Record<string, string>,
    successMessage: string,
  ) {
    if (!actionable || inFlight.current) return false;
    inFlight.current = true;
    setSubmission({ kind: "pending", message: "" });
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
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
            response.status === 400
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
    const changed = await submit(
      "/api/marketing/preferences",
      { token, scope },
      scope === "welcome"
        ? lifecycle ? "Lifecycle emails have been stopped." : "Welcome emails have been stopped."
        : "You have unsubscribed from marketing emails.",
    );
    if (changed) setWithdrawnScope(scope);
  }

  if (action === "unsubscribe") {
    return (
      <section
        className={styles.panel}
        aria-labelledby="marketing-consent-heading"
      >
        <p className="eyebrow">helix emails</p>
        <h1 id="marketing-consent-heading">Unsubscribe from marketing emails</h1>
        <p className={styles.intro}>
          Choose which marketing emails to stop. Order, account, and support
          emails are unaffected.
        </p>
        <div className={styles.form}>
          {!withdrawnScope && (
            <button
              type="button"
              className="btn btn--editorial-rounded btn--ghost"
              disabled={pending || !actionable}
              onClick={() => void withdraw("welcome")}
            >
              {lifecycle ? "Stop lifecycle emails" : "Stop welcome emails"}
            </button>
          )}
          {withdrawnScope !== "all" && (
            <button
              type="button"
              className="btn btn--editorial-rounded"
              disabled={pending || !actionable}
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
            {!actionable ? "Open the original link in your email to update your preferences." : pending ? "Updating your email preferences…" : submission.message}
          </p>
          <p className={styles.note}>
            A message already on its way may still arrive.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={styles.panel}
      aria-labelledby="marketing-consent-heading"
    >
      <p className="eyebrow">helix emails</p>
      <h1 id="marketing-consent-heading">Confirm your subscription</h1>
      <p className={styles.intro}>
        {reviews ? "Confirm that you want helix welcome offers, cart and product reminders, skincare education, post-purchase follow-ups, review invitations and next-purchase offers. Helix may use your signed-in product visits and cart activity for reminders. You can unsubscribe at any time." : "Confirm that you want helix welcome offers, cart and product reminders, and skincare education emails. We use your signed-in product visits and cart activity for these reminders. You can unsubscribe at any time."}
      </p>
      <div className={styles.form}>
        {submission.kind !== "success" && (
          <button
            type="button"
            className="btn btn--editorial-rounded"
            disabled={pending || !actionable}
            onClick={() =>
              void submit(
                "/api/marketing/confirm",
                { token, scope },
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
          {!actionable ? "Open the original link in your email to confirm." : submission.message}
        </p>
      </div>
    </section>
  );
}
