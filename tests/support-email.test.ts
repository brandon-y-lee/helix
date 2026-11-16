import { describe, expect, it } from "vitest";
import { renderSupportEmail, type SupportReplyReceipt } from "@/lib/support/email";

const reply: SupportReplyReceipt = {
  renderVersion: "support-text-v1", inquiryId: "5728e722-cc81-43be-b446-0695c7dc3aef",
  messageId: "870de323-e64a-456a-9a27-3b39d48dd659", inquiryRevision: 2, draftVersion: 1,
  subject: "Your routine question", body: "Hello <Sam> & team\nA human-approved reply.",
  html: '<div style="white-space: pre-wrap">Hello &lt;Sam&gt; &amp; team\nA human-approved reply.</div>', attachments: [],
};

describe("frozen support email content", () => {
  it("uses the exact approved subject, text and escaped HTML without adding mutable content", () => {
    expect(renderSupportEmail("support_reply", reply)).toEqual({ subject: reply.subject, text: reply.body, html: reply.html });
  });

  it("rejects altered HTML, unknown render versions, extra payload fields and attachments", () => {
    for (const change of [{ html: "<script>send()</script>" }, { renderVersion: "support-text-v2" },
      { attachments: [{ path: "https://outside.example/file" }] }, { cc: "other@example.com" },
      { subject: "Header\r\ninjection" }, { draftVersion: 0 }, { inquiryId: "invalid" }]) {
      expect(() => renderSupportEmail("support_reply", { ...reply, ...change } as SupportReplyReceipt)).toThrow();
    }
  });

  it("accepts only the generic acknowledgement, with no customer or Order facts", () => {
    const body = "We received your support inquiry. A member of Helix will review it. This acknowledgement does not confirm that a reply has been sent.";
    const receipt = { renderVersion: "support-ack-v1" as const, inquiryId: reply.inquiryId,
      subject: "Helix received your inquiry", body,
      html: `<div style="white-space: pre-wrap">${body}</div>`, attachments: [] as [] };
    expect(renderSupportEmail("support_acknowledgement", receipt)).toEqual({ subject: receipt.subject, text: body, html: receipt.html });
    expect(() => renderSupportEmail("support_acknowledgement", { ...receipt, body: "Your account exists." })).toThrow();
    expect(() => renderSupportEmail("support_acknowledgement", reply)).toThrow();
  });

  it("reuses the approved receiving identity and known threading headers unchanged", () => {
    const receipt = { ...reply, renderVersion: "support-text-v2" as const,
      replyTo: `reply-${"a".repeat(48)}@previous.resend.app`,
      headers: { "In-Reply-To": "<incoming@example.test>", References: "<first@example.test> <incoming@example.test>" } };
    expect(renderSupportEmail("support_reply", receipt)).toEqual({ subject: reply.subject, text: reply.body,
      html: reply.html, reply_to: receipt.replyTo, headers: receipt.headers });
    for (const headers of [{ ...receipt.headers, Bcc: "outside@example.test" },
      { ...receipt.headers, "In-Reply-To": "<incoming@example.test>\r\nBcc: outsider@example.test" },
      { ...receipt.headers, References: "<different@example.test>" }]) {
      expect(() => renderSupportEmail("support_reply", { ...receipt, headers })).toThrow();
    }
  });
});
