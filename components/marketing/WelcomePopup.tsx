"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useModalLayer, useModalPresence } from "@/components/overlays/modal-state";
import styles from "./WelcomePopup.module.css";

const DISMISSAL_KEY = "helix.welcome-dismissed-until";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
function dismissed() {
  try { return Number(localStorage.getItem(DISMISSAL_KEY)) > Date.now(); }
  catch { return true; } // Do not repeatedly interrupt visitors when storage is unavailable.
}
function rememberDismissal() {
  try { localStorage.setItem(DISMISSAL_KEY, String(Date.now() + THIRTY_DAYS)); } catch { /* Current view still closes. */ }
}

export function WelcomePopup() {
  const pathname = usePathname();
  if (pathname !== "/" && !/^\/products\/[^/]+\/?$/.test(pathname)) return null;
  return <WelcomePopupVisit key={pathname} />;
}

function WelcomePopupVisit() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState<"lifecycle" | "lifecycle_reviews">("lifecycle");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const title = useId();
  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);
  const submission = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const modalPresent = useModalPresence();
  const modalPresentRef = useRef(modalPresent);
  modalPresentRef.current = modalPresent;
  function close() {
    rememberDismissal();
    submission.current?.abort();
    setOpen(false);
  }
  const { active } = useModalLayer({
    open, layerRef, panelRef, onClose: close,
    initialFocus: () => closeRef.current,
    returnFocus: () => {
      if (priorFocus.current?.isConnected) priorFocus.current.focus({ preventScroll: true });
    },
  });
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(async () => {
      if (dismissed() || document.visibilityState !== "visible" || modalPresentRef.current) return;
      timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch("/api/marketing/readiness", {
          cache: "no-store", credentials: "same-origin", referrerPolicy: "no-referrer", signal: controller.signal,
        });
        const result: unknown = response.ok ? await response.json() : null;
        if (!alive || controller.signal.aborted || dismissed() || modalPresentRef.current || document.visibilityState !== "visible") return;
        if (result && typeof result === "object" && "ready" in result && result.ready === true) {
          const readyScope = "scope" in result ? result.scope : "lifecycle";
          if (readyScope !== "lifecycle" && readyScope !== "lifecycle_reviews") return;
          setScope(readyScope);
          priorFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setOpen(true);
        }
      } catch { /* Promotions remain hidden unless readiness is verified. */ }
      finally { clearTimeout(timeout); }
    }, 12000);
    return () => { alive = false; clearTimeout(timer); clearTimeout(timeout); controller.abort(); submission.current?.abort(); };
  }, []);

  useEffect(() => { if (state === "success") resultRef.current?.focus(); }, [state]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent || pending.current || state === "success" || !event.currentTarget.checkValidity()) return;
    pending.current = true;
    setState("pending");
    const controller = new AbortController();
    submission.current = controller;
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch("/api/marketing/subscription", {
        method: "POST", credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ email: email.trim(), consent: true, scope, source: "welcome_popup" }),
      });
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error("Unavailable");
      rememberDismissal();
      setEmail("");
      setState("success");
    } catch { if (!controller.signal.aborted) setState("error"); }
    finally {
      clearTimeout(timeout);
      pending.current = false;
      if (controller.signal.aborted && submission.current === controller) setState("error");
    }
  }
  if (!open) return null;
  return createPortal(
    <div ref={layerRef} className={styles.backdrop}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1}
        aria-hidden={active ? undefined : true} inert={active ? undefined : true} className={styles.panel}>
        <button ref={closeRef} className={styles.close} type="button" onClick={close} aria-label="Close welcome offer">Close</button>
        <p className="eyebrow">A welcome to helix</p>
        <h2 id={title}>Your first step. 15% off.</h2>
        <p>Join our email list for skincare guidance and a welcome offer on your first purchase.</p>
        <p className={styles.terms}>For eligible first-time customers after email confirmation. Use a verified account with the same email. Valid for 14 days after issue on USD merchandise only, excluding shipping and tax. Cannot be combined with other offers or points rewards.</p>
        {state !== "success" && <form onSubmit={submit} className={styles.form}>
          <label className={styles.field}>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={state === "pending"} /></label>
          <label className={styles.consent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={state === "pending"} required />
            <span>I want helix welcome offers, cart and product reminders, and skincare education{scope === "lifecycle_reviews" ? ", post-purchase follow-ups, review invitations and next-purchase offers" : ""} emails. Helix may use my signed-in product visits and cart activity for these reminders. I can unsubscribe at any time.</span>
          </label>
          <a href="/privacy" className={styles.privacy}>Privacy Policy</a>
          <button className="btn btn--editorial-rounded" type="submit" disabled={state === "pending"}>{state === "pending" ? "Submitting…" : "Join the list"}</button>
        </form>}
        <p ref={resultRef} tabIndex={-1} role={state === "error" ? "alert" : "status"} className={styles.result}>
          {state === "success" ? "If this address is eligible, check your inbox to confirm. Your welcome offer follows confirmation and eligibility checks." : state === "error" ? "We couldn't complete that request. Please try again." : ""}
        </p>
      </div>
    </div>, document.body,
  );
}
