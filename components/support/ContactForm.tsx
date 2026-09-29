"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { contactInquiryTypes } from "@/content/support/contact";
import styles from "./support.module.css";

export function ContactForm() {
  const [availability, setAvailability] = useState<"checking" | "available" | "unavailable" | "failed">("checking");
  const [check, setCheck] = useState(0);
  const [pending, setPending] = useState(false);
  const [received, setReceived] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ payload: string; id: string } | null>(null);
  const submitting = useRef(false);
  const successHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    let active = true;
    void fetch("/api/support/intake", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const result = response.ok ? await response.json() : null;
        if (active) setAvailability(result?.available === true ? "available" : result?.available === false ? "unavailable" : "failed");
      })
      .catch(() => { if (active) setAvailability("failed"); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [check]);

  useEffect(() => { if (received) successHeading.current?.focus(); }, [received]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const fields = new FormData(form);
    const payload = {
      name: String(fields.get("name") ?? "").trim(),
      email: String(fields.get("email") ?? "").trim(),
      inquiryType: String(fields.get("inquiryType") ?? "general"),
      subject: String(fields.get("subject") ?? "").trim(),
      body: String(fields.get("body") ?? "").trim(),
    };
    if (!payload.name || !payload.subject || !payload.body) {
      setError("Enter your name, subject, and message before submitting.");
      return;
    }
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.payload !== fingerprint) {
      attempt.current = { payload: fingerprint, id: crypto.randomUUID() };
    }
    const body = JSON.stringify({ ...payload, submissionId: attempt.current.id });
    if (new TextEncoder().encode(body).length > 48 * 1024) {
      setError("Your message is too large. Please shorten it before submitting.");
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/support/intake", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body, signal: controller.signal,
      });
      const result = await response.json();
      if (response.ok && result?.ok === true) {
        setReceived(true);
      } else if (response.status === 429) {
        setError("Too many requests. Please try again later.");
      } else if (response.status === 400 || response.status === 422) {
        setError("Check your details and message, then try again.");
      } else {
        setError("We couldn’t confirm receipt. Retry without changing your message to avoid a duplicate.");
      }
    } catch {
      setError("We couldn’t confirm receipt. Retry without changing your message to avoid a duplicate.");
    } finally {
      window.clearTimeout(timeout);
      submitting.current = false;
      setPending(false);
    }
  }

  if (availability === "checking") return <p className={styles.notice} role="status">Checking support availability…</p>;
  if (availability === "unavailable" || availability === "failed") return (
    <div className={styles.notice}>
      <p role={availability === "failed" ? "alert" : "status"}>{availability === "failed" ? "We couldn’t check support availability. Please try again." : "Support Intake is currently unavailable."}</p>
      <p>Your inquiry has not been submitted. You can still review the guidance below.</p>
      <button className={styles.retry} type="button" onClick={() => { setAvailability("checking"); setCheck((value) => value + 1); }}>Check availability again</button>
    </div>
  );
  if (received) return (
    <div className={styles.notice} role="status">
      <h2 ref={successHeading} tabIndex={-1}>Inquiry received</h2>
      <p>Your message is saved for the Helix support team. Email delivery is restricted during development; this confirmation does not mean an email was sent.</p>
    </div>
  );
  return (
    <form className="contact-form" onSubmit={submit} aria-labelledby="contact-form-title">
      <h2 id="contact-form-title">Send an inquiry</h2>
      <div className="contact-form__notice" id="contact-development-notice">
        <p className="eyebrow">Development service</p>
        <p>Inquiries are saved privately. Email acknowledgements and replies can reach only approved test recipients during development. Do not include passwords, payment card numbers, one-time codes, or medical records.</p>
      </div>
      <fieldset className={styles.fields} disabled={pending} aria-describedby="contact-development-notice">
        <legend className="sr-only">Inquiry details</legend>
        <div className="contact-form__grid">
          <div className="contact-field"><label htmlFor="support-name">Name</label><input id="support-name" name="name" autoComplete="name" maxLength={100} required /></div>
          <div className="contact-field"><label htmlFor="support-email">Email</label><input id="support-email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
        </div>
        <div className="contact-field"><label htmlFor="support-type">Inquiry type</label><select id="support-type" name="inquiryType" defaultValue="general">{contactInquiryTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
        <div className="contact-field"><label htmlFor="support-subject">Subject</label><input id="support-subject" name="subject" maxLength={200} required /></div>
        <div className="contact-field"><label htmlFor="support-message">Message</label><textarea id="support-message" name="body" rows={7} maxLength={10_000} required /></div>
        <div className="contact-form__actions"><button type="submit" className="btn btn--editorial-rounded">{pending ? "Submitting…" : "Submit inquiry"}</button></div>
      </fieldset>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </form>
  );
}
