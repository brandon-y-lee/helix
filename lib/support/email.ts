import "server-only";

type SupportEmailContent = {
  inquiryId: string;
  subject: string;
  body: string;
  html: string;
  attachments: [];
};
export type SupportAcknowledgementReceipt = SupportEmailContent & { renderVersion: "support-ack-v1" };
export type SupportReplyReceipt = SupportEmailContent & {
  renderVersion: "support-text-v1";
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
): { subject: string; html: string; text: string } {
  const fields = ["renderVersion", "inquiryId", "subject", "body", "html", "attachments",
    ...(purpose === "support_reply" ? ["messageId", "inquiryRevision", "draftVersion"] : [])];
  const valid = receipt && typeof receipt === "object" && !Array.isArray(receipt)
    && Object.keys(receipt).length === fields.length && Object.keys(receipt).every((key) => fields.includes(key))
    && uuid(receipt.inquiryId) && typeof receipt.subject === "string" && receipt.subject.trim() === receipt.subject
    && receipt.subject.length > 0 && receipt.subject.length <= 200 && !/[\u0000-\u001f\u007f]/.test(receipt.subject)
    && typeof receipt.body === "string" && receipt.body.trim() === receipt.body
    && receipt.body.length > 0 && receipt.body.length <= 10_000 && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(receipt.body)
    && receipt.html === plainHtml(receipt.body) && Array.isArray(receipt.attachments) && receipt.attachments.length === 0;
  if (!valid) throw new Error("Invalid support email receipt.");
  if (purpose === "support_acknowledgement") {
    if (receipt.renderVersion !== "support-ack-v1" || receipt.subject !== acknowledgement.subject || receipt.body !== acknowledgement.body) {
      throw new Error("Invalid support acknowledgement.");
    }
  } else if (receipt.renderVersion !== "support-text-v1" || !uuid(receipt.messageId)
    || !revision(receipt.inquiryRevision) || !revision(receipt.draftVersion)) {
    throw new Error("Invalid support reply approval.");
  }
  return { subject: receipt.subject, html: receipt.html, text: receipt.body };
}
