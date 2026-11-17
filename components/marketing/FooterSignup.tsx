"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { HelixIdentity } from "@/components/brand/HelixIdentity";
import styles from "./FooterSignup.module.css";

type Scope = "lifecycle" | "lifecycle_reviews";
type State = "idle" | "pending" | "success" | "error";
const unavailable = "Email signup is temporarily unavailable. Please check back soon.";
const requestOptions = { credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer" } as const;

export function FooterSignup() {
  const id = useId();
  const [scope, setScope] = useState<Scope | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<State>("idle");
  const pending = useRef(false);
  const submission = useRef<AbortController | null>(null);
  const result = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); setChecking(false); }, 5000);
    void (async () => {
      try {
        const response = await fetch("/api/marketing/readiness", { ...requestOptions, signal: controller.signal });
        const data: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (response.ok && data && typeof data === "object" && "ready" in data && data.ready === true) {
          const readyScope = "scope" in data ? data.scope : "lifecycle";
          if (readyScope === "lifecycle" || readyScope === "lifecycle_reviews") setScope(readyScope);
        }
      } catch { /* Intake stays disabled unless readiness is verified. */ }
      finally { clearTimeout(timeout); if (!controller.signal.aborted) setChecking(false); }
    })();
    return () => { clearTimeout(timeout); controller.abort(); submission.current?.abort(); };
  }, []);

  useEffect(() => { if (state === "success") result.current?.focus(); }, [state]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scope || !consent || pending.current || state === "success" || !event.currentTarget.checkValidity()) return;
    pending.current = true;
    setState("pending");
    const controller = new AbortController();
    submission.current = controller;
    const timeout = setTimeout(() => {
      if (!controller.signal.aborted) { controller.abort(); pending.current = false; setState("error"); }
    }, 5000);
    try {
      const response = await fetch("/api/marketing/subscription", {
        ...requestOptions, method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        // Reuse the existing generic preferences intake, not popup attribution.
        body: JSON.stringify({ email: email.trim(), consent: true, scope, source: "email_preferences" }),
      });
      const data: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || !data || typeof data !== "object" || !("ok" in data) || data.ok !== true) throw new Error("Unavailable");
      setEmail(""); setConsent(false); setState("success");
    } catch { if (!controller.signal.aborted) setState("error"); }
    finally { clearTimeout(timeout); if (submission.current === controller) pending.current = false; }
  }

  const disabled = !scope || state === "pending";
  return (
    <section className={styles.section} aria-labelledby={`${id}-heading`}>
      <div className={`storefront-shell ${styles.inner}`}>
        <div className={styles.copy}>
          <h2 id={`${id}-heading`}>A little more <span className={styles.wordmark}><HelixIdentity /></span> in your inbox.</h2>
          <p>New arrivals, longevity tips, and little gifts for your inbox.</p>
        </div>
        <div className={styles.signup}>
          {state !== "success" && <form onSubmit={submit} aria-label="Email signup">
            <div className={styles.fields}>
              <label className="sr-only" htmlFor={`${id}-email`}>Email address</label>
              <input id={`${id}-email`} type="email" placeholder="Email address" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} disabled={disabled} aria-describedby={`${id}-result`} />
              <button type="submit" disabled={disabled || !consent}>{state === "pending" ? "Submitting…" : "Sign up"}</button>
            </div>
            <label className={styles.consent}>
              <input type="checkbox" required checked={consent} disabled={disabled} onChange={e => setConsent(e.target.checked)} />
              <span>I want helix welcome offers, cart and product reminders, and skincare education{scope === "lifecycle_reviews" ? ", post-purchase follow-ups, review invitations and next-purchase offers" : ""} emails. Helix may use my signed-in product visits and cart activity for these reminders. I can unsubscribe at any time. <a href="/privacy">Privacy Policy</a></span>
            </label>
          </form>}
          <p id={`${id}-result`} ref={result} tabIndex={-1} role={state === "error" ? "alert" : "status"} className={styles.result}>
            {checking ? "Checking email signup availability…" : !scope ? unavailable : state === "success" ? "If this address is eligible, check your inbox to confirm." : state === "error" ? "We couldn't complete that request. Please try again." : state === "pending" ? "Submitting your request…" : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
