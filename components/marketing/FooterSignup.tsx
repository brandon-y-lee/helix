"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { HelixIdentity } from "@/components/brand/HelixIdentity";
import styles from "./FooterSignup.module.css";

type State = "idle" | "pending" | "success" | "limited" | "error";

const subscribe = () => () => {};

const messages: Record<State, string> = {
  idle: "",
  pending: "Signing up…",
  success: "You’re signed up.",
  limited: "Please wait a few minutes and try again.",
  error: "We couldn’t sign you up. Please try again.",
};

export function FooterSignup() {
  const id = useId();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [state, setState] = useState<State>("idle");
  const submission = useRef<AbortController | null>(null);
  const result = useRef<HTMLParagraphElement>(null);

  useEffect(() => () => submission.current?.abort(), []);
  useEffect(() => { if (state === "success") result.current?.focus(); }, [state]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (submission.current || state === "success" || !form.checkValidity()) return;
    const email = new FormData(form).get("email");
    if (typeof email !== "string") return;

    const controller = new AbortController();
    submission.current = controller;
    setState("pending");
    const timeout = setTimeout(() => {
      controller.abort();
      submission.current = null;
      setState("error");
    }, 5000);

    try {
      const response = await fetch("/api/marketing/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        redirect: "error",
        signal: controller.signal,
        body: JSON.stringify({ email: email.trim() }),
      });
      const data: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (response.ok && data && typeof data === "object" && "ok" in data && data.ok === true) {
        form.reset();
        setState("success");
      } else {
        setState(response.status === 429 ? "limited" : "error");
      }
    } catch {
      if (!controller.signal.aborted) setState("error");
    } finally {
      clearTimeout(timeout);
      if (submission.current === controller) submission.current = null;
    }
  }

  const disabled = !hydrated || state === "pending";
  return (
    <section className={styles.section} aria-labelledby={`${id}-heading`}>
      <div className={`storefront-shell ${styles.inner}`}>
        <div className={styles.copy}>
          <h2 id={`${id}-heading`}>A little more <span className={styles.wordmark}><HelixIdentity /></span> in your inbox.</h2>
          <p>New arrivals, looksmaxxing tips, and little gifts for your inbox.</p>
        </div>
        <div className={styles.signup}>
          {state !== "success" && (
            <form action="/api/marketing/newsletter" method="post" onSubmit={submit} aria-label="Newsletter signup">
              <div className={styles.fields}>
                <label className="sr-only" htmlFor={`${id}-email`}>Email address</label>
                <input
                  id={`${id}-email`}
                  name="email"
                  type="email"
                  placeholder="Email address"
                  autoComplete="email"
                  maxLength={254}
                  required
                  disabled={disabled}
                  aria-describedby={`${id}-result`}
                />
                <button type="submit" disabled={disabled}>
                  {state === "pending" ? "Signing up…" : "Sign up"}
                </button>
              </div>
            </form>
          )}
          <p id={`${id}-result`} ref={result} tabIndex={-1} role={state === "error" || state === "limited" ? "alert" : "status"} className={styles.result}>
            {messages[state]}
          </p>
        </div>
      </div>
    </section>
  );
}
