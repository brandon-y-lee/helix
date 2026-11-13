"use client";
import { useState } from "react";
import { MODERATION_REASONS } from "@/lib/reviews/contract";
export type ModerationRow = {
  id: string;
  revision: number;
  environment: string;
  status: string;
  publishedRevision: number | null;
  publishedTitle: string | null;
  publishedBody: string | null;
  productSlug: string;
  displayName: string;
  rating: number;
  title: string;
  body: string;
};
export function ReviewModeration({ initial }: { initial: ModerationRow[] }) {
  const [rows, setRows] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function decide(row: ModerationRow, decision: string, reason: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/reviews/moderate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          expectedRevision: row.revision,
          decision,
          reason,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Unable to moderate.");
      setRows((current) => current.filter((x) => x.id !== row.id));
      setMessage("Decision recorded.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to moderate.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h1>Product review moderation</h1>
      <p>
        Apply the same rules to every rating. Never reject criticism or rewrite
        the customer’s words. Sandbox approvals are never displayed publicly.
      </p>
      <p role="status">{message}</p>
      {rows.length === 0 && <p>No pending or published reviews.</p>}
      {rows.map((row) => (
        <form
          className="review-editor"
          key={row.id}
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void decide(
              row,
              String(form.get("decision")),
              String(form.get("reason")),
            );
          }}
        >
          <h2>
            {row.productSlug}: {row.title}
          </h2>
          <p>
            {row.displayName} · {row.rating}/5 · {row.environment}
          </p>
          <p>Latest revision: {row.status}</p>
          <p>{row.body}</p>
          {row.publishedRevision !== null && (
            <aside>
              <h3>Currently published: {row.publishedTitle}</h3>
              <p>{row.publishedBody}</p>
              <p>
                Removing publication also closes any pending edit. The author
                can submit a new revision.
              </p>
            </aside>
          )}
          <label>
            Decision
            <select name="decision" disabled={busy}>
              {row.status === "pending" && (
                <>
                  <option value="published">Approve latest revision</option>
                  <option value="rejected">Reject latest revision</option>
                </>
              )}
              {row.publishedRevision !== null && (
                <option value="removed">Remove published review</option>
              )}
            </select>
          </label>
          <label>
            Reason (required for rejection)
            <select name="reason" disabled={busy}>
              {MODERATION_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn--editorial-rounded" disabled={busy}>
            Record decision
          </button>
        </form>
      ))}
    </section>
  );
}
