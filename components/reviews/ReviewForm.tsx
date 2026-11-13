"use client";
import { useState, type FormEvent } from "react";
import type { OwnedReview } from "@/lib/reviews/contract";
export function ReviewForm({
  purchase,
  transport = fetch,
}: {
  purchase: OwnedReview;
  transport?: typeof fetch;
}) {
  const [revision, setRevision] = useState(purchase.revision ?? 0),
    [id, setId] = useState(purchase.id),
    [status, setStatus] = useState(purchase.status);
  const [name, setName] = useState(purchase.displayName ?? ""),
    [rating, setRating] = useState(purchase.rating ?? 5),
    [title, setTitle] = useState(purchase.title ?? ""),
    [body, setBody] = useState(purchase.body ?? ""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function send(action: "submit" | "withdraw") {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await transport(`/api/reviews/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "submit"
            ? {
                orderItemId: purchase.orderItemId,
                expectedRevision: revision,
                displayName: name,
                rating,
                title,
                body,
                consent,
              }
            : { id, expectedRevision: revision },
        ),
      });
      const data = await response.json();
      if (!response.ok || !data.ok)
        throw new Error(data.error ?? "Unable to save review.");
      setId(data.result.id);
      setRevision(data.result.revision);
      setStatus(data.result.status);
      setConsent(false);
      setMessage(
        action === "withdraw"
          ? "Your review is no longer public."
          : "Submitted for moderation. Your honest experience is welcome, positive or negative.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save review.",
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (event.currentTarget.reportValidity() && consent) void send("submit");
  }
  return (
    <section className="review-editor">
      <h2>{purchase.productName}</h2>
      <p>Status: {status ?? "Not submitted"}</p>
      {purchase.environment === "sandbox" && (
        <p>
          Sandbox purchase. This review will never appear as a genuine customer
          review.
        </p>
      )}
      <form onSubmit={submit}>
        <label>
          Public display name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            disabled={busy}
          />
        </label>
        <label>
          Your rating
          <select
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            disabled={busy}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "star" : "stars"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
            disabled={busy}
          />
        </label>
        <label>
          Your experience
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minLength={10}
            maxLength={2000}
            required
            disabled={busy}
          />
        </label>
        <label className="review-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            disabled={busy}
          />
          I agree to publish this display name, rating and review on helix. I
          will not include private contact or medical information.
        </label>
        <p>
          We screen all ratings using the same rules for spam, private
          information, threats, unrelated content and promotional claims. We do
          not reject reviews for criticism or low ratings. Edits are screened
          before replacing published text.
        </p>
        <button
          className="btn btn--editorial-rounded"
          disabled={busy || !consent}
        >
          {busy ? "Saving…" : "Submit review"}
        </button>
        {id && status !== "withdrawn" && (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => void send("withdraw")}
          >
            Withdraw review
          </button>
        )}
        <p role="status" aria-live="polite">
          {message}
        </p>
      </form>
    </section>
  );
}
