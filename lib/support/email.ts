import "server-only";
import { isEmailAddress } from "@/lib/email/config";
import { supportRfcMessageId } from "@/lib/support/threading";

type SupportEmailContent = {
  inquiryId: string;
  subject: string;
  body: string;
  html: string;
  attachments: [];
};
type Threading = { replyTo: string; headers: Record<string, string> };
export type SupportAcknowledgementReceipt = SupportEmailContent & ({ renderVersion: "support-ack-v1" } | ({ renderVersion: "support-ack-v2" } & Threading));
export type SupportReplyReceipt = SupportEmailContent & ({ renderVersion: "support-text-v1" } | ({ renderVersion: "support-text-v2" } & Threading)) & {
  messageId: string;
  inquiryRevision: number;
  draftVersion: number;
};

const acknowledgement = {
  subject: "Helix received your inquiry",
  body: "We received your support inquiry. A member of Helix will review it. This acknowledgement does not confirm that a reply has been sent.",
};
const uuid = (value: unknown) => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const revision = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const plainHtml = (body: string) => `<div style="white-space: pre-wrap">${body.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</div>`;

/** Validate and reuse the content frozen by the admission/approval transaction. */
export function renderSupportEmail(
  purpose: "support_acknowledgement" | "support_reply",
  receipt: SupportAcknowledgementReceipt | SupportReplyReceipt,
): { subject: string; html: string; text: string; reply_to?: string; headers?: Record<string, string> } {
  const threaded = receipt?.renderVersion === "support-ack-v2" || receipt?.renderVersion === "support-text-v2";
  const fields = ["renderVersion", "inquiryId", "subject", "body", "html", "attachments",
    ...(purpose === "support_reply" ? ["messageId", "inquiryRevision", "draftVersion"] : []), ...(threaded ? ["replyTo", "headers"] : [])];
  const valid = receipt && typeof receipt === "object" && !Array.isArray(receipt)
    && Object.keys(receipt).length === fields.length && Object.keys(receipt).every((key) => fields.includes(key))
    && uuid(receipt.inquiryId) && typeof receipt.subject === "string" && receipt.subject.trim() === receipt.subject
    && receipt.subject.length > 0 && receipt.subject.length <= 200 && !/[\u0000-\u001f\u007f]/.test(receipt.subject)
    && typeof receipt.body === "string" && receipt.body.trim() === receipt.body
    && receipt.body.length > 0 && receipt.body.length <= 10_000 && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(receipt.body)
    && receipt.html === plainHtml(receipt.body) && Array.isArray(receipt.attachments) && receipt.attachments.length === 0;
  if (!valid) throw new Error("Invalid support email receipt.");
  if (purpose === "support_acknowledgement") {
    if (!["support-ack-v1", "support-ack-v2"].includes(receipt.renderVersion) || receipt.subject !== acknowledgement.subject || receipt.body !== acknowledgement.body) {
      throw new Error("Invalid support acknowledgement.");
    }
  } else if (!("messageId" in receipt) || !["support-text-v1", "support-text-v2"].includes(receipt.renderVersion) || !uuid(receipt.messageId)
    || !revision(receipt.inquiryRevision) || !revision(receipt.draftVersion)) {
    throw new Error("Invalid support reply approval.");
  }
  const content = { subject: receipt.subject, html: receipt.html, text: receipt.body };
  if (threaded && "replyTo" in receipt) {
    const { headers, replyTo } = receipt;
    if (!isEmailAddress(replyTo) || !/^reply-[a-f0-9]{48}@/.test(replyTo)
      || !headers || typeof headers !== "object" || Array.isArray(headers)) throw new Error("Invalid support receiving identity.");
    const keys = Object.keys(headers);
    if (keys.length) {
      const references = typeof headers.References === "string" ? headers.References.split(" ") : [];
      if (purpose !== "support_reply" || keys.length !== 2 || !keys.includes("In-Reply-To") || !keys.includes("References")
        || !supportRfcMessageId(headers["In-Reply-To"]) || headers.References.length > 4096
        || references.length > 20 || !references.length || references.some((id) => !supportRfcMessageId(id))
        || new Set(references).size !== references.length || references.at(-1) !== headers["In-Reply-To"]) throw new Error("Invalid support threading.");
    }
    return { ...content, reply_to: replyTo, headers };
  }
  return content;
}
