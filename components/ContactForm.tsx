"use client";

import { useState } from "react";
import {
  contactInquiryTypes,
  contactTransportStatus,
} from "@/content/support/contact";

type ContactErrors = Partial<Record<"name" | "email" | "type" | "subject" | "message", string>>;

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

export function ContactForm() {
  const [errors, setErrors] = useState<ContactErrors>({});
  const [status, setStatus] = useState("");

  function validate(form: HTMLFormElement): ContactErrors {
    const formData = new FormData(form);
    const nextErrors: ContactErrors = {};
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const type = String(formData.get("type") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();

    if (!name) nextErrors.name = "Enter your name.";
    if (!email || !isEmail(email)) nextErrors.email = "Enter a valid email address.";
    if (!type) nextErrors.type = "Choose an inquiry type.";
    if (!subject) nextErrors.subject = "Enter a subject.";
    if (message.length < 20) nextErrors.message = "Enter at least 20 characters.";

    return nextErrors;
  }

  return (
    <form
      className="contact-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const nextErrors = validate(event.currentTarget);
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
          setStatus("Check the highlighted fields. No message was sent.");
          return;
        }
        setStatus(
          "Your message is locally valid, but support transport is not configured. No message was sent or stored.",
        );
      }}
    >
      <div className="contact-form__notice">
        <p className="eyebrow">{contactTransportStatus.heading}</p>
        <p>{contactTransportStatus.message}</p>
      </div>

      <div className="contact-form__grid">
        <div className="contact-field">
          <label htmlFor="contact-name">Name</label>
          <input
            id="contact-name"
            name="name"
            type="text"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "contact-name-error" : undefined}
          />
          {errors.name && <small id="contact-name-error">{errors.name}</small>}
        </div>

        <div className="contact-field">
          <label htmlFor="contact-email">Email</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "contact-email-error" : undefined}
          />
          {errors.email && <small id="contact-email-error">{errors.email}</small>}
        </div>
      </div>

      <div className="contact-field">
        <label htmlFor="contact-type">Inquiry type</label>
        <select
          id="contact-type"
          name="type"
          aria-invalid={Boolean(errors.type)}
          aria-describedby={errors.type ? "contact-type-error" : "contact-type-help"}
          defaultValue=""
        >
          <option value="" disabled>
            Select a topic
          </option>
          {contactInquiryTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <small id="contact-type-help">
          Do not include payment-card details, medical records, shipping
          addresses, government ID, or sensitive health information.
        </small>
        {errors.type && <small id="contact-type-error">{errors.type}</small>}
      </div>

      <div className="contact-field">
        <label htmlFor="contact-subject">Subject</label>
        <input
          id="contact-subject"
          name="subject"
          type="text"
          aria-invalid={Boolean(errors.subject)}
          aria-describedby={errors.subject ? "contact-subject-error" : undefined}
        />
        {errors.subject && <small id="contact-subject-error">{errors.subject}</small>}
      </div>

      <div className="contact-field">
        <label htmlFor="contact-message">Message</label>
        <textarea
          id="contact-message"
          name="message"
          rows={7}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "contact-message-error" : undefined}
        />
        {errors.message && <small id="contact-message-error">{errors.message}</small>}
      </div>

      <div className="contact-form__actions">
        <button type="submit" className="btn">
          Check message
        </button>
        <p role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </form>
  );
}
