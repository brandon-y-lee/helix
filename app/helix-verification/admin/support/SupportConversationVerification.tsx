"use client";

import { useMemo } from "react";
import { SupportConversation } from "@/components/admin/support/SupportConversation";
import type { SupportAiJob, SupportInboundReviewMutation, SupportInquiryDetail, SupportMutation } from "@/lib/support/types";

export type SupportConversationScenario = "photos" | "new-context" | "refresh-error" | "quarantine" | "ai-draft";
const inquiryId = "30000000-0000-4000-8000-000000000001";
const photoId = "30000000-0000-4000-8000-000000000002";
const inquiryPath = `/api/admin/support/${inquiryId}`;
const photoPath = `${inquiryPath}/photos/${photoId}`;
const receivedAt = "2026-09-28T12:00:00.000Z";

export function supportInquiryFixture(scenario: SupportConversationScenario): SupportInquiryDetail {
  return {
    id: inquiryId, revision: 2, status: "open", inquiryType: "product", name: "Sample Customer", email: "sample@example.test",
    subject: "Product photo question", createdAt: receivedAt, updatedAt: receivedAt, lastDeliveryState: null,
    pendingInbound: scenario === "photos" || scenario === "quarantine" ? 1 : 0,
    messages: [{ id: "synthetic-message", kind: "inbound", subject: "Product photo question", body: "Please review the condition of my product.", createdAt: receivedAt, delivery: null,
      photos: scenario === "photos" ? [
        { id: photoId, status: "ready", rejectionReason: null },
        { id: "synthetic-pending", status: "processing", rejectionReason: null },
        { id: "synthetic-rejected", status: "rejected", rejectionReason: "unsupported_image" },
      ] : [],
    }],
    draft: { id: "synthetic-draft", version: 1, inquiryRevision: 2, recipient: "sample@example.test", subject: "Re: Product photo question", body: "Thank you for contacting Helix. We will review your product question.", approved: false },
    nextMessageCursor: null, order: null,
    quarantinedInbound: scenario === "quarantine" ? [{
      id: "synthetic-incoming", subject: "Forwarded product details", body: 'Additional product context. <img src="https://unsafe.example/tracker">',
      receivedAt, reason: "forwarded_message", participantMatches: true, acceptAllowed: true, retryAllowed: false,
    }] : [],
  };
}

// This adapter cannot read accounts, generate text, send replies, upload files, or access Storage.
export function createSupportConversationRequest(scenario: SupportConversationScenario): typeof fetch {
  let inquiry = supportInquiryFixture(scenario);
  let aiJob: SupportAiJob | null = null;
  let refreshFailed = false;
  let contextChanged = false;
  const response = (status = 200) => Response.json({ inquiry: structuredClone(inquiry) }, { status });
  return async (input, options) => {
    if (typeof input !== "string") throw new Error("Unsupported synthetic request");
    const method = options?.method ?? "GET";
    if (input === `${inquiryPath}/ai-draft` && scenario === "ai-draft") {
      if (method === "POST" && typeof options?.body === "string") {
        const mutation = JSON.parse(options.body);
        if (mutation.action !== "request" || mutation.expectedRevision !== inquiry.revision || mutation.expectedDraftVersion !== inquiry.draft?.version) throw new Error("Unsupported synthetic mutation");
        aiJob ??= { id: "30000000-0000-4000-8000-000000000003", state: "queued", inquiryRevision: inquiry.revision, draftVersion: inquiry.draft?.version ?? 0,
          createdAt: receivedAt, errorCode: null, draftId: null, needsHuman: null, references: [] };
      } else if (method === "GET") {
        if (aiJob?.state === "queued") {
          inquiry = { ...inquiry, revision: inquiry.revision + 1, draft: { id: "synthetic-ai-draft", version: (inquiry.draft?.version ?? 0) + 1,
            inquiryRevision: inquiry.revision + 1, recipient: inquiry.email, subject: "Re: Product photo question",
            body: "Thank you for your question. Please share which product you are asking about so we can review the details.", approved: false } };
          aiJob = { ...aiJob, state: "completed", draftId: inquiry.draft!.id, needsHuman: true,
            references: [{ id: "faq:medical-advice", text: "Helix does not provide medical advice." }] };
        }
      } else throw new Error("Unsupported synthetic request");
      return Response.json({ available: true, job: aiJob, ...(aiJob?.state === "completed" ? { inquiry: structuredClone(inquiry) } : {}) });
    }
    if (input === inquiryPath && method === "GET") {
      if (scenario === "refresh-error" && !refreshFailed) {
        refreshFailed = true;
        throw new Error("Synthetic refresh unavailable");
      }
      return response();
    }
    if (input === photoPath && method === "POST" && scenario === "photos") {
      return Response.json({ url: `${photoPath}?capability=synthetic-unused-token`, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    }
    if (input === `${photoPath}?capability=synthetic-unused-token` && method === "GET" && scenario === "photos") {
      // An eight-pixel square of neutral color, encoded locally as fixed WebP bytes.
      const bytes = Uint8Array.from(atob("UklGRioAAABXRUJQVlA4IB4AAABwAQCdASoIAAgAAUAmJZwCdAF1AAD++s8BT6fAAAA="), (value) => value.charCodeAt(0));
      return new Response(bytes, { headers: { "Content-Type": "image/webp" } });
    }
    if ((input !== inquiryPath && input !== `${inquiryPath}/inbound`) || method !== "POST" || typeof options?.body !== "string") {
      throw new Error("Unsupported synthetic request");
    }
    const mutation = JSON.parse(options.body) as SupportMutation | SupportInboundReviewMutation;
    if (mutation.expectedRevision !== inquiry.revision) return response(409);
    if (mutation.action === "save_draft") {
      inquiry = { ...inquiry, draft: { id: "synthetic-draft", version: (inquiry.draft?.version ?? 0) + 1, inquiryRevision: inquiry.revision,
        recipient: inquiry.email, subject: mutation.subject, body: mutation.body, approved: false } };
    } else if (mutation.action === "approve_reply" && inquiry.draft) {
      if (scenario === "new-context" && !contextChanged) {
        contextChanged = true;
        inquiry = { ...inquiry, revision: inquiry.revision + 1, messages: [...inquiry.messages, {
          id: "synthetic-new-message", kind: "inbound", subject: "Additional product details", body: "The pump is damaged. Please consider this before replying.", createdAt: receivedAt, delivery: null,
        }] };
        return response(409);
      }
      if (inquiry.pendingInbound || inquiry.draft.inquiryRevision !== inquiry.revision) return response(409);
      inquiry = { ...inquiry, draft: { ...inquiry.draft, approved: true } };
    } else if (mutation.action === "accept" || mutation.action === "dismiss") {
      const incoming = inquiry.quarantinedInbound?.find((item) => item.id === mutation.inboundId);
      if (!incoming) return response(409);
      inquiry = { ...inquiry, revision: inquiry.revision + 1, pendingInbound: 0, quarantinedInbound: [],
        messages: mutation.action === "accept" ? [...inquiry.messages, {
          id: incoming.id, kind: "inbound", subject: incoming.subject, body: incoming.body, createdAt: incoming.receivedAt, delivery: null,
        }] : inquiry.messages };
    } else {
      throw new Error("Unsupported synthetic mutation");
    }
    return response();
  };
}

export function SupportConversationVerification({ scenario }: { scenario: SupportConversationScenario }) {
  const request = useMemo(() => createSupportConversationRequest(scenario), [scenario]);
  const inquiry = useMemo(() => supportInquiryFixture(scenario), [scenario]);
  return <SupportConversation initialInquiry={inquiry} canReply initialAiStatus={{ available: scenario === "ai-draft", job: null }} request={request} navigationEnabled={false} />;
}
