"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SupportAiStatus, SupportInboundReviewMutation, SupportInquiryDetail, SupportMutation } from "@/lib/support/types";
import { InquiryTime, supportDeliveryLabel } from "./SupportInbox";
import { SupportPhotoViewer } from "./SupportPhotoViewer";
import styles from "./support.module.css";

function incomingReviewReason(reason: string): string {
  if (reason === "forwarded_message") return "Forwarded content needs review.";
  if (reason === "automated_message") return "Automated email cannot be added to the conversation.";
  if (["sender_mismatch", "invalid_sender", "reply_to_changed"].includes(reason)) return "The sender or reply address could not be matched safely.";
  if (["authentication_failed", "authentication_unknown"].includes(reason)) return "The email’s origin could not be verified.";
  if (["attachment_metadata_invalid", "attachment_limits_exceeded"].includes(reason)) return "The attached files need review.";
  if (["invalid_body", "body_truncated", "empty_message"].includes(reason)) return "The message content could not be accepted in full.";
  if (reason === "fetch_failed") return "The incoming email could not be retrieved.";
  return "The conversation match needs review.";
}

type AiDraftRequest = { action: "request"; requestId: string; expectedRevision: number; expectedDraftVersion: number };

function draftFailureReason(code: string | null): string {
  if (code === "authentication_required") return "Draft worker needs owner attention. Check its sign-in before retrying, or continue with a manual reply.";
  if (code === "runtime_mismatch") return "Draft worker needs owner attention. Check its setup before retrying, or continue with a manual reply.";
  if (code === "quota_exceeded") return "Drafting allowance is unavailable. Retry after it resets, or continue with a manual reply.";
  return "Draft generation failed. You can retry or continue with a manual reply.";
}

export function SupportConversation({ initialInquiry, canReply: accessCanReply, initialAiStatus = { available: false, job: null }, request = fetch, navigationEnabled = true }: { initialInquiry: SupportInquiryDetail; canReply: boolean; initialAiStatus?: SupportAiStatus; request?: typeof fetch; navigationEnabled?: boolean }) {
  const [inquiry, setInquiry] = useState(initialInquiry);
  const canReply = accessCanReply && !inquiry.redactedAt;
  const [subject, setSubject] = useState(initialInquiry.draft?.subject ?? `Re: ${initialInquiry.subject}`.slice(0, 200));
  const [body, setBody] = useState(initialInquiry.draft?.body ?? "");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reviewRequired, setReviewRequired] = useState(false);
  const [paginationBlocked, setPaginationBlocked] = useState(false);
  const [historyFocus, setHistoryFocus] = useState(0);
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  const [aiStatus, setAiStatus] = useState(initialAiStatus);
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState("");
  const aiRequest = useRef<AiDraftRequest | null>(null);
  const aiController = useRef<AbortController | null>(null);
  const aiMounted = useRef(true);
  const draft = inquiry.draft;
  const aiJob = aiStatus.job;
  const aiActive = aiJob?.state === "queued" || aiJob?.state === "running";
  const generatedDraft = aiJob?.state === "completed" && draft?.id === aiJob.draftId;
  const unchanged = draft?.subject === subject && draft.body === body;
  const incomingPending = (inquiry.pendingInbound ?? 0) > 0;
  const approvable = canReply && draft && unchanged && !incomingPending && !reviewRequired && !draft.approved && draft.inquiryRevision === inquiry.revision;

  useEffect(() => { if (historyFocus > 0) historyHeading.current?.focus(); }, [historyFocus]);

  const checkAiDraft = useCallback(async (mutation?: AiDraftRequest | { action: "cancel"; jobId: string }) => {
    if (!canReply || aiController.current) return;
    const controller = new AbortController();
    aiController.current = controller;
    setAiPending(true);
    setAiError("");
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await request(`/api/admin/support/${encodeURIComponent(inquiry.id)}/ai-draft`, {
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
        ...(mutation ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mutation) } : {}),
      });
      const result = await response.json() as SupportAiStatus;
      if (response.status >= 400 && response.status < 500) aiRequest.current = null;
      if (!response.ok || typeof result?.available !== "boolean" || !("job" in result)) throw new Error("ai_status_unavailable");
      if (!aiMounted.current) return;
      setAiStatus(result);
      if (result.job?.state === "stale") setReviewRequired(true);
      if (mutation) aiRequest.current = null;
      const updated = result.inquiry;
      if (result.job?.state === "completed" && updated?.id === inquiry.id && updated.draft?.id === result.job.draftId) {
        // A delayed job response cannot replace newer saved work. Editor text stays local.
        setInquiry((current) => updated.revision > current.revision && (updated.draft?.version ?? 0) >= (current.draft?.version ?? 0) ? updated : current);
      }
    } catch {
      if (aiMounted.current) setAiError("Draft status could not be confirmed. Check its status or retry the request. Your edits have been kept.");
    } finally {
      window.clearTimeout(timeout);
      aiController.current = null;
      if (aiMounted.current) setAiPending(false);
    }
  }, [canReply, inquiry.id, request]);

  useEffect(() => {
    aiMounted.current = true;
    return () => { aiMounted.current = false; aiController.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!canReply || !aiStatus.available) return;
    const reconnect = () => { void checkAiDraft(); };
    window.addEventListener("online", reconnect);
    let checks = 0;
    const timer = aiActive ? window.setInterval(() => {
      if (++checks > 100) {
        window.clearInterval(timer);
        setAiError("Automatic draft status checks paused. Check the draft status to continue.");
      } else void checkAiDraft();
    }, 3_000) : undefined;
    return () => { window.removeEventListener("online", reconnect); window.clearInterval(timer); };
  }, [aiActive, aiJob?.id, aiStatus.available, canReply, checkAiDraft]);

  function generateDraft() {
    if (pending || aiPending || aiActive || incomingPending || reviewRequired || inquiry.status !== "open") return;
    aiRequest.current ??= { action: "request", requestId: crypto.randomUUID(), expectedRevision: inquiry.revision, expectedDraftVersion: draft?.version ?? 0 };
    void checkAiDraft(aiRequest.current);
  }

  async function loadEarlier() {
    const cursor = inquiry.nextMessageCursor;
    if (submitting.current || !cursor || paginationBlocked) return;
    submitting.current = true;
    setPending(true);
    setError("");
    setNotice("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await request(`/api/admin/support/${encodeURIComponent(inquiry.id)}?before=${encodeURIComponent(cursor)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const result = await response.json();
      const older = result?.inquiry as SupportInquiryDetail | undefined;
      if (!response.ok || !older || older.id !== inquiry.id || !Array.isArray(older.messages) || older.messages.length > 50) {
        setError("Earlier messages could not be loaded. Retry, or refresh the inquiry if its history has changed. Your edits have been kept.");
        return;
      }
      if (older.redactedAt) {
        setInquiry(older);
        setHistoryFocus((value) => value + 1);
        return;
      }
      if (older.nextMessageCursor === cursor) {
        setPaginationBlocked(true);
        setError("The earlier-message position could not be advanced. Refresh the inquiry to load its current history.");
        return;
      }
      const existingIds = new Set(inquiry.messages.map((message) => message.id));
      const count = older.messages.filter((message) => !existingIds.has(message.id)).length;
      setInquiry((current) => {
        if (current.id !== older.id) return current;
        const seen = new Set(current.messages.map((message) => message.id));
        const previous = older.messages.filter((message) => {
          if (seen.has(message.id)) return false;
          seen.add(message.id);
          return true;
        });
        // An older page cannot rebind approval to a newer, unseen conversation revision.
        return { ...current, messages: [...previous, ...current.messages], nextMessageCursor: older.nextMessageCursor };
      });
      setNotice(`${count} earlier ${count === 1 ? "message" : "messages"} loaded.${older.nextMessageCursor === null ? " You have reached the start of this conversation." : ""}`);
      if (older.revision !== inquiry.revision) {
        setReviewRequired(true);
        setError("This inquiry has newer activity. Refresh the conversation before making further changes. Your edits have been kept.");
      }
      setHistoryFocus((value) => value + 1);
    } catch {
      setError("Earlier messages could not be loaded. Retry, or refresh the inquiry if its history has changed. Your edits have been kept.");
    } finally {
      window.clearTimeout(timeout);
      submitting.current = false;
      setPending(false);
    }
  }

  async function reload() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await request(`/api/admin/support/${encodeURIComponent(inquiry.id)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result?.inquiry) return false;
      setInquiry(result.inquiry as SupportInquiryDetail);
      setPaginationBlocked(false);
      return true;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function refresh() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setReviewRequired(true);
    setNotice("");
    setError("");
    const refreshed = await reload();
    if (refreshed) setNotice(canReply ? "Conversation refreshed. Your unsaved edits have been kept." : "Conversation refreshed.");
    else setError("The latest inquiry could not be loaded. Please try refreshing again.");
    submitting.current = false;
    setPending(false);
  }

  async function mutate(mutation: SupportMutation | SupportInboundReviewMutation) {
    if (submitting.current || !canReply) return;
    submitting.current = true;
    setPending(true);
    setNotice("");
    setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const incomingReview = "inboundId" in mutation;
      const response = await request(`/api/admin/support/${encodeURIComponent(inquiry.id)}${incomingReview ? "/inbound" : ""}`, {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(mutation),
      });
      const result = await response.json();
      if (!response.ok || !result?.inquiry) {
        setReviewRequired(true);
        if (response.status === 409) {
          const refreshed = await reload();
          setError(result?.error?.code === "reply_reconciliation_required"
            ? "An earlier reply has an uncertain delivery outcome and needs review before another reply can be approved."
            : refreshed
              ? "Review the latest conversation and save your draft again before approving. Your edits have been kept."
              : "This inquiry changed, but the latest conversation could not be loaded. Refresh it before trying again.");
        } else if (response.status === 401 || response.status === 403) {
          setError("Your support access could not be verified. Sign in again or ask the owner to review your access.");
        } else {
          setError("The change could not be confirmed. Refresh the inquiry before trying again.");
        }
        return;
      }
      const updated = result.inquiry as SupportInquiryDetail;
      setInquiry(updated);
      if (mutation.action === "save_draft") {
        setReviewRequired(false);
        setSubject(updated.draft?.subject ?? subject);
        setBody(updated.draft?.body ?? body);
        setNotice("Draft saved. Review the exact reply below before approving.");
      } else if (mutation.action === "approve_reply") {
        setNotice("Reply approved and queued. Delivery is shown separately in the conversation.");
      } else if (mutation.action === "add_note") {
        setNote("");
        setNotice("Internal note saved. It will not be emailed to the customer.");
      } else if (incomingReview) {
        setReviewRequired(true);
        setNotice(mutation.action === "accept" ? "Incoming email added. Review the latest conversation and save your draft again before approving. Your edits have been kept."
          : mutation.action === "retry" ? "Incoming email processing restarted. Your edits have been kept."
            : "Incoming email dismissed. Your edits have been kept.");
      } else {
        setNotice(`${updated.status === "closed" ? "Inquiry closed" : "Inquiry reopened"}. Review and approve any revised reply before delivery.`);
      }
    } catch {
      setReviewRequired(true);
      setError("The change could not be confirmed. Refresh the inquiry before trying again.");
    } finally {
      window.clearTimeout(timeout);
      submitting.current = false;
      setPending(false);
    }
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity() || !subject.trim() || !body.trim()) return;
    void mutate({ action: "save_draft", expectedRevision: inquiry.revision, expectedDraftVersion: draft?.version ?? 0, subject, body });
  }

  return (
    <section className={styles.panel} aria-labelledby="support-conversation-title">
      <div className={styles.actions}>
        {navigationEnabled ? <Link href="/admin/support" className={styles.textButton}>Back to Support Inbox</Link> : <span className={styles.muted}>Support Inbox preview</span>}
        <button className={styles.textButton} type="button" disabled={pending} onClick={() => void refresh()}>Refresh inquiry</button>
      </div>
      <header className={styles.header}>
        <h1 id="support-conversation-title">{inquiry.subject}</h1>
        <p className={styles.muted}>{inquiry.name} · {inquiry.email}</p>
        <div className={styles.actions}>
          <span className={styles.badge}>{inquiry.status === "open" ? "Open" : "Closed"}</span>
          {canReply ? <button className={styles.textButton} type="button" aria-describedby="support-status-effect" disabled={pending} onClick={() => void mutate({ action: "set_status", expectedRevision: inquiry.revision, status: inquiry.status === "open" ? "closed" : "open" })}>{inquiry.status === "open" ? "Close inquiry" : "Reopen inquiry"}</button> : null}
        </div>
        <p className={styles.muted}>Open or closed describes the inquiry. It does not confirm that a reply reached the customer.</p>
        {inquiry.order ? <p>Associated Order: {inquiry.order.orderNumber}</p> : null}
      </header>
      {canReply ? <p id="support-status-effect" className={styles.muted}>Changing inquiry status invalidates a queued reply approval. If delivery may have started, review its outcome before approving another reply. Accepted messages remain in the conversation.</p> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
      {incomingPending ? <p className={styles.notice}>Incoming messages or photos are still being checked or need review below. Reply approval is unavailable until they are resolved. Refresh the inquiry, review the latest context, and save your draft again before approving.</p> : null}
      {inquiry.quarantinedInbound?.length ? <section className={styles.card} aria-labelledby="support-incoming-review-title">
        <h2 id="support-incoming-review-title">Incoming email for review</h2>
        <p className={styles.muted}>This content has not been added to the conversation. Email content does not verify the sender’s identity or authorize access to an Order. Adding a message keeps the reply recipient fixed as {inquiry.email}.</p>
        <ul className={styles.conversation}>{inquiry.quarantinedInbound.map((incoming) => <li className={styles.card} key={incoming.id}>
          <h3>{incoming.subject || "Incoming email"}</h3>
          <p className={styles.meta}><InquiryTime value={incoming.receivedAt} /><span>{incoming.retryAllowed ? "Processing could not finish" : incoming.acceptAllowed ? "Conversation match needs review" : "Cannot be added safely"}</span></p>
          <p>{incomingReviewReason(incoming.reason)}</p>
          {!incoming.participantMatches ? <p>The sender does not match this conversation’s participant.</p> : null}
          <p className={styles.messageBody}>{incoming.body || "Message content is not available."}</p>
          {canReply ? <div className={styles.actions}>
            {incoming.acceptAllowed ? <button type="button" className={styles.textButton} disabled={pending} onClick={() => void mutate({ action: "accept", inboundId: incoming.id, expectedRevision: inquiry.revision })}>Add to this conversation</button> : null}
            {incoming.retryAllowed ? <button type="button" className={styles.textButton} disabled={pending} onClick={() => void mutate({ action: "retry", inboundId: incoming.id, expectedRevision: inquiry.revision })}>Retry incoming email</button> : null}
            <button type="button" className={styles.textButton} disabled={pending} onClick={() => void mutate({ action: "dismiss", inboundId: incoming.id, expectedRevision: inquiry.revision })}>Dismiss incoming email</button>
          </div> : null}
        </li>)}</ul>
      </section> : null}
      <section aria-labelledby="support-messages-title">
        <h2 id="support-messages-title" tabIndex={-1} ref={historyHeading}>Conversation</h2>
        {inquiry.nextMessageCursor ? <div className={styles.actions}><button type="button" className={styles.textButton} disabled={pending || paginationBlocked} onClick={() => void loadEarlier()}>Load earlier messages</button></div> : null}
        <ol className={styles.conversation}>
          {inquiry.messages.map((message) => (
            <li className={`${styles.card} ${message.kind === "note" ? styles.note : ""}`} key={message.id}>
              <p className={styles.meta}><span>{message.kind === "note" ? "Internal note · visible only to support" : message.kind === "inbound" ? "Customer inquiry" : "Support reply"}</span><InquiryTime value={message.createdAt} /></p>
              {message.subject ? <h3>{message.subject}</h3> : null}
              <p className={styles.messageBody}>{message.body}</p>
              {message.photos?.length ? <section className={styles.photos} aria-label="Private customer photos">{message.photos.map((photo, index) => <SupportPhotoViewer key={photo.id} inquiryId={inquiry.id} photo={photo} index={index + 1} request={request} />)}</section> : null}
              {message.delivery ? <p className={styles.meta}>{supportDeliveryLabel(message.delivery.deliveryStatus ?? message.delivery.state)}</p> : null}
            </li>
          ))}
        </ol>
      </section>
      {canReply ? <section className={styles.card} aria-labelledby="support-reply-title">
        <h2 id="support-reply-title">Manual reply</h2>
        <p className={styles.muted}>Save your draft, review its recipient and content, then explicitly approve it for delivery. Email remains restricted to approved test recipients during development.</p>
        {aiStatus.available ? <section aria-label="Draft assistance">
          <p className={styles.muted}>Generate a draft from accepted conversation text and support facts. Review all wording before approving a reply.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.textButton} disabled={pending || aiPending || aiActive || incomingPending || reviewRequired || inquiry.status !== "open"} onClick={generateDraft}>{aiRequest.current ? "Retry draft request" : "Generate draft"}</button>
            {aiActive && aiJob ? <button type="button" className={styles.textButton} disabled={aiPending} onClick={() => void checkAiDraft({ action: "cancel", jobId: aiJob.id })}>Cancel draft generation</button> : null}
            {aiJob || aiError ? <button type="button" className={styles.textButton} disabled={aiPending} onClick={() => void checkAiDraft()}>Check draft status</button> : null}
          </div>
          {aiActive ? <p role="status">{aiJob?.state === "queued" ? "Draft generation queued." : "Draft generation in progress."} You can keep editing your reply.</p> : null}
          {aiJob?.state === "completed" ? <p role="status">{generatedDraft ? "Generated draft saved for review." : "Generated draft is no longer the current saved reply. Refresh the inquiry to review its latest state."} {aiJob.needsHuman ? "Additional human review is needed. " : ""}Your editor text has been kept.</p> : null}
          {aiJob?.state === "cancelled" ? <p role="status">Draft generation cancelled. Your editor text has been kept.</p> : null}
          {aiJob?.state === "failed" ? <p role="status">{draftFailureReason(aiJob.errorCode)}</p> : null}
          {aiJob?.state === "stale" ? <p role="status">Draft generation stopped because the conversation changed. Refresh the inquiry, review the latest context, and save your draft before trying again. Your editor text has been kept.</p> : null}
          {aiError ? <p role="alert" className={styles.error}>{aiError}</p> : null}
        </section> : null}
        <form className={styles.form} onSubmit={saveDraft}>
          <fieldset disabled={pending}>
            <legend className="sr-only">Reply draft</legend>
            <label className={styles.field} htmlFor="reply-recipient">Recipient<input id="reply-recipient" value={draft?.recipient ?? inquiry.email} readOnly /></label>
            <label className={styles.field} htmlFor="reply-subject">Reply subject<input id="reply-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} required /></label>
            <label className={styles.field} htmlFor="reply-body">Reply<textarea id="reply-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={10_000} rows={8} required /></label>
            <div className={styles.actions}><button className={styles.textButton} type="submit" disabled={!subject.trim() || !body.trim()}>{pending ? "Working…" : "Save draft"}</button></div>
          </fieldset>
        </form>
        {draft ? <section className={styles.preview} aria-label="Saved reply for approval">
          <h3>Saved reply</h3>
          <p><strong>To:</strong> {draft.recipient}</p>
          <p><strong>Subject:</strong> {draft.subject}</p>
          <p><strong>Attachments:</strong> None. Customer photos stay private in the conversation.</p>
          <p className={styles.messageBody}>{draft.body}</p>
          {generatedDraft ? <>
            {aiJob.references.length ? <div><h4>Draft references</h4><ul>{aiJob.references.map((reference) => <li key={reference.id}>{reference.text}</li>)}</ul></div> : null}
            {!unchanged ? <><p className={styles.muted}>Loading this draft replaces the text currently in your editor.</p><button type="button" className={styles.textButton} disabled={pending} onClick={() => { setSubject(draft.subject); setBody(draft.body); }}>Load generated draft into editor</button></> : null}
          </> : null}
          {draft.approved ? <p>Already approved. Check the reply’s delivery state in the conversation.</p> : null}
        </section> : null}
        {!unchanged && draft ? <p className={styles.muted}>Save your changes before approving a reply.</p> : null}
        {draft && !draft.approved && (reviewRequired || draft.inquiryRevision !== inquiry.revision) ? <p className={styles.notice}>Review the latest conversation and save your draft again before approving.</p> : null}
        <div className={styles.actions}><button className={styles.button} type="button" disabled={!approvable || pending} onClick={() => { if (draft) void mutate({ action: "approve_reply", expectedRevision: inquiry.revision, draftVersion: draft.version }); }}>Approve and queue reply</button></div>
      </section> : <p className={styles.notice}>{inquiry.redactedAt ? "This inquiry’s content has been removed under the retention policy. It cannot be reopened or changed." : "You have read-only access to this conversation."}</p>}
      {canReply ? <section className={`${styles.card} ${styles.note}`} aria-labelledby="support-note-title">
        <h2 id="support-note-title">Private notes</h2>
        <p className={styles.muted}>Internal notes are visible only to support and are never included in outgoing replies.</p>
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (event.currentTarget.reportValidity() && note.trim()) void mutate({ action: "add_note", expectedRevision: inquiry.revision, body: note }); }}>
          <label className={styles.field} htmlFor="support-note">Internal note<textarea id="support-note" rows={4} maxLength={10_000} value={note} onChange={(event) => setNote(event.target.value)} disabled={pending} required /></label>
          <div className={styles.actions}><button className={styles.textButton} type="submit" disabled={pending || !note.trim()}>Add internal note</button></div>
        </form>
      </section> : null}
    </section>
  );
}
