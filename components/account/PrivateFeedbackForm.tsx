"use client";

import { useState } from "react";

export function PrivateFeedbackForm({
  feedbackId,
  orderNumber,
}: {
  feedbackId: string;
  orderNumber: string;
}) {
  const [rating, setRating] = useState("5");
  const [comments, setComments] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    if (pending || submitted) return;
    setPending(true);
    setStatus(null);

    try {
      const response = await fetch("/api/rewards/private-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feedbackId, rating: Number(rating), comments }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          data && typeof data.error === "string"
            ? data.error
            : "Private feedback could not be submitted.",
        );
      }
      setSubmitted(true);
      setStatus("Private feedback submitted. 300 points were awarded.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Private feedback could not be submitted.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="account-form account-form--compact"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="form-field">
        <label htmlFor={`feedback-rating-${feedbackId}`}>Overall experience</label>
        <select
          id={`feedback-rating-${feedbackId}`}
          value={rating}
          onChange={(event) => setRating(event.target.value)}
          disabled={submitted}
        >
          <option value="5">Very good</option>
          <option value="4">Good</option>
          <option value="3">Neutral</option>
          <option value="2">Difficult</option>
          <option value="1">Poor</option>
        </select>
      </div>
      <div className="form-field">
        <label htmlFor={`feedback-comments-${feedbackId}`}>
          Private product feedback for {orderNumber}
        </label>
        <textarea
          id={`feedback-comments-${feedbackId}`}
          value={comments}
          onChange={(event) => setComments(event.target.value)}
          rows={4}
          maxLength={2000}
          disabled={submitted}
        />
      </div>
      {status && (
        <p
          className={`form-status ${submitted ? "form-status--success" : "form-status--error"}`}
          role="status"
        >
          {status}
        </p>
      )}
      <button
        type="submit"
        className="btn btn--sm btn--editorial-rounded"
        disabled={pending || submitted}
      >
        {pending ? "Submitting" : "Submit private feedback"}
      </button>
    </form>
  );
}
