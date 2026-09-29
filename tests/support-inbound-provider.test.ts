// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { InboundProviderError, readResendInbound, readResendSentMessageId, downloadResendPhoto } from "@/lib/support/inbound-provider";

const emailId = "4ef9a417-02e9-4d39-ad75-9611e0fcc33c";
const attachmentId = "2a0c9ce0-3112-4728-976e-47ddcd16a318";
const apiKey = "re_synthetic";
const replyId = "<helix-reply@resend.dev>";
function received(overrides: Record<string, unknown> = {}) {
  return { id: emailId, from: "Customer <customer@example.test>", to: ["Support <reply+opaque@example.test>"],
    subject: "Re: Question about my order", text: "Please help with my order.", html: null,
    message_id: "<customer-message@example.test>", headers: { "In-Reply-To": replyId, References: `<first@example.test> ${replyId}` },
    cc: [], bcc: [], reply_to: [], received_for: [], authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
    attachments: [{ id: attachmentId, content_type: "image/png", size: 4096, filename: "untrusted.png" }], ...overrides };
}
function json(data: unknown, init?: ResponseInit) { return new Response(JSON.stringify(data), init); }

describe("Resend receiving boundary", () => {
  it("reads a bounded provider message into private plain text and stable history identifiers", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(received()));
    const signal = AbortSignal.timeout(45_000);
    expect(await readResendInbound(emailId, apiKey, signal, fetcher)).toEqual({
      providerEmailId: emailId, rfcMessageId: "<customer-message@example.test>",
      from: "customer@example.test", to: ["reply+opaque@example.test"], subject: "Re: Question about my order",
      body: "Please help with my order.", inReplyTo: replyId, references: ["<first@example.test>", replyId],
      quarantineReason: null, attachments: [{ id: attachmentId, contentType: "image/png", size: 4096 }],
    });
    expect(fetcher).toHaveBeenCalledWith(`https://api.resend.com/emails/receiving/${emailId}?html_format=cid`, {
      method: "GET", signal, redirect: "error", cache: "no-store", headers: { Authorization: `Bearer ${apiKey}` },
    });
  });
  it("converts HTML-only mail to inert text without tracking content or active element content", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(received({ text: "", html: '<p>Hello &amp; help</p><p>Next line<br>Thanks</p><img src="https://tracking.example.test/pixel" alt="tracking"><script>secret_script</script><style>secret_style</style><template>secret_template</template><svg>secret_svg</svg><math>secret_math</math><iframe>secret_frame</iframe><object>secret_object</object><a href="javascript:secret_link">read this</a>' })));
    const result = await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher);
    expect(result.body).toBe("Hello & help\n\nNext line\nThanks\n\nread this");
    expect(result.quarantineReason).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["body_truncated", { text: "x".repeat(10_001) }],
    ["invalid_body", { text: { malicious: "shape" }, html: null }],
    ["invalid_subject", { subject: "private\r\nBcc: stolen@example.test" }],
    ["invalid_sender", { from: "customer@example.test, thief@example.test" }],
    ["ambiguous_recipients", { to: ["reply+opaque@example.test", "other@example.test"] }],
    ["ambiguous_recipients", { cc: ["other@example.test"] }],
    ["ambiguous_recipients", { bcc: ["other@example.test"] }],
    ["ambiguous_recipients", { to: Array.from({ length: 6 }, (_, i) => `r${i}@example.test`) }],
    ["reply_to_changed", { reply_to: ["thief@example.test"] }],
    ["forwarded_message", { subject: "Re: Fwd: Private order" }],
    ["forwarded_message", { received_for: ["original@example.test"] }],
    ["forwarded_message", { headers: { "Resent-From": "other@example.test" } }],
    ["automated_message", { headers: { "Auto-Submitted": "auto-replied" } }],
    ["automated_message", { headers: { Precedence: "bulk" } }],
    ["automated_message", { headers: { "Return-Path": "<>" } }],
    ["automated_message", { from: "mailer-daemon@example.test" }],
    ["authentication_unknown", { authentication: null }],
    ["authentication_unknown", { authentication: { spf: "pass", dkim: "pass", dmarc: "gray" } }],
    ["authentication_failed", { authentication: { spf: "fail", dkim: "pass", dmarc: "pass" } }],
    ["invalid_history", { message_id: "<injected@example.test>\r\nX: secret" }],
    ["invalid_history", { headers: { "In-Reply-To": "<a@example.test> <b@example.test>" } }],
    ["invalid_history", { headers: { References: Array.from({ length: 21 }, (_, i) => `<${i}@example.test>`).join(" ") } }],
    ["invalid_history", { headers: { References: "a".repeat(4097) } }],
    ["invalid_headers", { headers: { "In-Reply-To": replyId, "in-reply-to": "<different@example.test>" } }],
  ])("preserves bounded private content but quarantines %s", async (reason, overrides) => {
    const fetcher = vi.fn().mockResolvedValue(json(received(overrides as Record<string, unknown>)));
    const result = await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher);
    expect(result.quarantineReason).toBe(reason);
    expect(result.body.length).toBeLessThanOrEqual(10_000);
    expect(result.to.length).toBeLessThanOrEqual(5);
    expect(result.references.length).toBeLessThanOrEqual(20);
    expect(result.subject).not.toMatch(/[\r\n]/);
    expect(result.rfcMessageId).not.toMatch(/[\r\n]/);
  });
  it("uses receiver-computed authentication and does not infer trust from forged headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(received({ authentication: null, headers: { "Authentication-Results": "spf=pass; dkim=pass; dmarc=pass" } })));
    expect((await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).quarantineReason).toBe("authentication_unknown");
  });
  it("preserves aliases and uses repeated exact routing only as neutral metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(received({ from: "Customer.Name+case@Example.test", to: ["reply+opaque@example.test", "reply+opaque@example.test"],
      received_for: ["reply+opaque@example.test", "reply+opaque@example.test"], reply_to: ["customer.name+case@example.test"], headers: { "Auto-Submitted": "no" } })));
    const result = await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher);
    expect(result.from).toBe("customer.name+case@example.test");
    expect(result.to).toEqual(["reply+opaque@example.test"]);
    expect(result.quarantineReason).toBeNull();
  });
  it("keeps photo-only messages truthful without inventing customer text", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(received({ text: null, html: null })));
    const result = await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher);
    expect(result.body).toBe("The customer sent photos without a message.");
    expect(result.quarantineReason).toBeNull();
  });
  it.each([
    [401, "blocked", "provider_blocked"], [403, "blocked", "provider_blocked"],
    [404, "permanent", "provider_unavailable"], [408, "transient", "provider_failed"],
    [429, "transient", "provider_rate_limited"], [500, "transient", "provider_failed"],
    [503, "transient", "provider_failed"], [422, "permanent", "provider_failed"], [302, "permanent", "provider_failed"],
  ])("classifies API %s without retaining provider details", async (status, kind, code) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("secret provider payload customer@example.test", { status: Number(status) }));
    const error = await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(InboundProviderError);
    expect(error).toMatchObject({ kind, code });
    expect(String(error)).not.toMatch(/secret|customer@/);
  });
  it("rejects malformed success or a mismatched identity without trusting its body", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("private invalid json"))
      .mockResolvedValueOnce(json(received({ id: attachmentId })));
    for (let i = 0; i < 2; i++) {
      await expect(readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher))
        .rejects.toMatchObject({ kind: "permanent", code: "provider_invalid_response" });
    }
  });
  it("sanitizes interrupted fetches and stops before fetching invalid identifiers", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("private token URL and customer address"));
    await expect(readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).rejects.toMatchObject({ kind: "transient", code: "provider_connection_failed" });
    await expect(readResendInbound("../escape", apiKey, AbortSignal.timeout(45_000), fetcher)).rejects.toMatchObject({ kind: "permanent", code: "invalid_input" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("cancels an oversized response even when its declared size lies", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(512 * 1024 + 1)); }, cancel });
    const fetcher = vi.fn().mockResolvedValue(new Response(body, { headers: { "Content-Length": "1" } }));
    await expect(readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).rejects.toMatchObject({ kind: "permanent", code: "provider_response_too_large" });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("aborts an otherwise stalled response stream and reports only a safe code", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ cancel })));
    const result = readResendInbound(emailId, apiKey, controller.signal, fetcher);
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort(new Error("private abort reason"));
    await expect(result).rejects.toMatchObject({ kind: "transient", code: "aborted" });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("unfolds normal transit and References headers while rejecting multiple reply identities", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(received({ headers: { Received: "by mail.example.test\r\n for <reply+opaque@example.test>", "In-Reply-To": replyId } })))
      .mockResolvedValueOnce(json(received({ headers: { References: `<first@example.test>\r\n ${replyId}` } })))
      .mockResolvedValueOnce(json(received({ headers: { "In-Reply-To": "<first@example.test>\r\n <second@example.test>" } })));
    expect((await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).quarantineReason).toBeNull();
    expect((await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).references).toEqual(["<first@example.test>", replyId]);
    expect((await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).quarantineReason).toBe("invalid_history");
  });
  it("does not describe an unsupported attachment as a photo", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(received({ text: null, attachments: [{ id: attachmentId, content_type: "application/pdf", size: 5 }] })));
    expect((await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).body).toBe("The customer sent attachments without a message.");
  });
  it("never masks automated mail or loop denial behind a reviewable forwarding reason", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(received({ subject: "Fwd: message", headers: { "Auto-Submitted": "auto-replied" }, cc: ["other@example.test"] })))
      .mockResolvedValueOnce(json(received({ subject: "Fwd: message", headers: { "X-Loop": "loop@example.test", "Auto-Submitted": "auto-replied" } })));
    expect((await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).quarantineReason).toBe("automated_message");
    expect((await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).quarantineReason).toBe("mail_loop");
  });
  it.each([
    ["authentication_failed", { received_for: ["forwarded@example.test"], authentication: { spf: "fail", dkim: "pass", dmarc: "fail" } }],
    ["authentication_failed", { headers: { "In-Reply-To": "invalid" }, authentication: { spf: "fail", dkim: "pass", dmarc: "pass" } }],
    ["invalid_headers", { received_for: ["forwarded@example.test"], headers: { "In-Reply-To": replyId, "in-reply-to": "<other@example.test>" } }],
    ["invalid_subject", { headers: { "In-Reply-To": "invalid" }, subject: "Question\r\nBcc: private@example.test" }],
    ["attachment_metadata_invalid", { authentication: null, attachments: [{ id: "invalid", content_type: "image/png", size: 5 }] }],
    ["attachment_metadata_invalid", { attachments: [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `2a0c9ce0-3112-4728-976e-47ddcd16a31${i}`, content_type: "image/png", size: 5 })),
      { id: "invalid", content_type: "image/png", size: 5 },
    ] }],
    ["invalid_body", { received_for: ["forwarded@example.test"], text: { invalid: "shape" } }],
    ["empty_message", { received_for: ["forwarded@example.test"], text: null, attachments: [] }],
    ["invalid_sender", { from: "first@example.test, second@example.test", authentication: null, text: "x".repeat(10_001) }],
    ["ambiguous_recipients", { to: ["reply+opaque@example.test", "other@example.test"], authentication: null, text: "x".repeat(10_001) }],
    ["reply_to_changed", { reply_to: ["other@example.test"], authentication: null, text: "x".repeat(10_001) }],
    ["automated_message", { received_for: ["forwarded@example.test"], authentication: null, text: { invalid: "shape" }, headers: { "Auto-Submitted": "auto-replied" } }],
  ])("keeps non-reviewable %s visible when a message also has a reviewable defect", async (reason, overrides) => {
    const fetcher = vi.fn().mockResolvedValue(json(received(overrides as Record<string, unknown>)));
    const result = await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher);
    expect(result.quarantineReason).toBe(reason);
  });
  it.each([
    { "Auto-Submitted": "no", "auto-submitted": "auto-replied" },
    { "Return-Path": "<customer@example.test>", "return-path": "<>" },
    { ...Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`x-header-${i}`, "value"])), "Auto-Submitted": "auto-generated" },
  ])("retains hard automated-mail evidence even among malformed or excessive headers", async (headers) => {
    const fetcher = vi.fn().mockResolvedValue(json(received({ headers })));
    expect((await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).quarantineReason).toBe("automated_message");
  });
  it("uses a matching original-recipient header only as neutral transit metadata", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(received({ headers: { "X-Original-To": "reply+opaque@example.test" } })))
      .mockResolvedValueOnce(json(received({ headers: { "X-Original-To": "original@example.test" } })));
    expect((await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).quarantineReason).toBeNull();
    expect((await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).quarantineReason).toBe("forwarded_message");
  });
  it.each([
    { cc: "other@example.test" }, { bcc: "other@example.test" }, { to: "different@example.test" },
  ])("quarantines lateral recipient headers even when provider address arrays omit them", async (headers) => {
    const fetcher = vi.fn().mockResolvedValue(json(received({ headers })));
    expect((await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).quarantineReason).toBe("ambiguous_recipients");
  });
  it("quarantines a contradictory sender or reply destination header", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(received({ headers: { from: "thief@example.test" } })))
      .mockResolvedValueOnce(json(received({ headers: { "reply-to": "thief@example.test" } })));
    expect((await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).quarantineReason).toBe("invalid_sender");
    expect((await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).quarantineReason).toBe("reply_to_changed");
  });
  it("keeps text when attachment metadata is malformed, duplicated, too numerous, or oversized", async () => {
    const photo = { id: attachmentId, content_type: "image/png", size: 8 * 1024 * 1024 };
    const samples = [
      { attachments: [{ ...photo, id: "../../escape" }], reason: "attachment_metadata_invalid" },
      { attachments: [photo, photo], reason: "attachment_metadata_invalid" },
      { attachments: Array.from({ length: 6 }, (_, i) => ({ ...photo, id: `2a0c9ce0-3112-4728-976e-47ddcd16a31${i}` })), reason: "attachment_limits_exceeded" },
      { attachments: Array.from({ length: 3 }, (_, i) => ({ ...photo, id: `2a0c9ce0-3112-4728-976e-47ddcd16a31${i}` })), reason: "attachment_limits_exceeded" },
      { attachments: [{ ...photo, size: 10 * 1024 * 1024 + 1 }], reason: "attachment_limits_exceeded" },
    ];
    for (const sample of samples) {
      const fetcher = vi.fn().mockResolvedValue(json(received({ attachments: sample.attachments })));
      const result = await readResendInbound(emailId, apiKey, AbortSignal.timeout(45_000), fetcher);
      expect(result.quarantineReason).toBe(sample.reason);
      expect(result.body).toBe("Please help with my order.");
      expect(result.attachments.length).toBeLessThanOrEqual(5);
    }
  });
});

describe("outbound history reconciliation", () => {
  it("retrieves only the validated RFC identity of the exact accepted provider email", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ id: emailId, message_id: replyId, html: "private message", to: ["private@example.test"] }));
    const signal = AbortSignal.timeout(45_000);
    expect(await readResendSentMessageId(emailId, apiKey, signal, fetcher)).toBe(replyId);
    expect(fetcher).toHaveBeenCalledWith(`https://api.resend.com/emails/${emailId}`, expect.objectContaining({ signal, redirect: "error", cache: "no-store" }));
  });
  it("permits pending message identity but rejects mismatched or injected history", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ id: emailId, message_id: null }))
      .mockResolvedValueOnce(json({ id: attachmentId, message_id: replyId }))
      .mockResolvedValueOnce(json({ id: emailId, message_id: "<sent@example.test>\r\nBcc: private" }));
    expect(await readResendSentMessageId(emailId, apiKey, AbortSignal.timeout(45_000), fetcher)).toBeNull();
    for (let i = 0; i < 2; i++) await expect(readResendSentMessageId(emailId, apiKey, AbortSignal.timeout(45_000), fetcher))
      .rejects.toMatchObject({ kind: "permanent", code: "provider_invalid_response" });
  });
});

describe("private Resend attachment download", () => {
  const downloadUrl = `https://inbound-cdn.resend.com/${emailId}/attachments/${attachmentId}?signature=private-temporary`;
  function attachment(overrides: Record<string, unknown> = {}) {
    return { id: attachmentId, download_url: downloadUrl, expires_at: new Date(Date.now() + 3_600_000).toISOString(), size: 1, content_type: "image/png", ...overrides };
  }
  it("fetches fresh attachment metadata and downloads bytes without forwarding its API credential", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(attachment())).mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    const signal = AbortSignal.timeout(45_000);
    expect(await downloadResendPhoto(emailId, attachmentId, apiKey, signal, fetcher)).toEqual(Buffer.from([1, 2, 3]));
    expect(fetcher).toHaveBeenNthCalledWith(1, `https://api.resend.com/emails/receiving/${emailId}/attachments/${attachmentId}`, {
      method: "GET", signal, redirect: "error", cache: "no-store", headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, downloadUrl, { method: "GET", signal, redirect: "error", cache: "no-store" });
  });
  it.each([
    `http://inbound-cdn.resend.com/${emailId}/attachments/${attachmentId}`,
    `https://inbound-cdn.resend.com.evil.test/${emailId}/attachments/${attachmentId}`,
    `https://inbound-cdn.resend.com@evil.test/${emailId}/attachments/${attachmentId}`,
    `https://user@inbound-cdn.resend.com/${emailId}/attachments/${attachmentId}`,
    `https://inbound-cdn.resend.com:443/${emailId}/attachments/${attachmentId}`,
    `https://inbound-cdn.resend.com/${attachmentId}/attachments/${attachmentId}`,
    `https://inbound-cdn.resend.com/${emailId}/attachments/${emailId}`,
    `https://inbound-cdn.resend.com/${emailId}/attachments/${attachmentId}/suffix`,
    `https://inbound-cdn.resend.com/other/../${emailId}/attachments/${attachmentId}`,
    `${downloadUrl}#private-fragment`,
    "file:///etc/passwd",
  ])("refuses a metadata-supplied URL outside the exact provider resource: %s", async (download_url) => {
    const fetcher = vi.fn().mockResolvedValue(json(attachment({ download_url })));
    await expect(downloadResendPhoto(emailId, attachmentId, apiKey, AbortSignal.timeout(45_000), fetcher))
      .rejects.toMatchObject({ kind: "permanent", code: "attachment_url_invalid" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("binds the metadata ID and refreshes one expired URL before retrying the same photo", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(attachment({ id: emailId })))
      .mockResolvedValueOnce(json(attachment())).mockResolvedValueOnce(new Response("private expired URL", { status: 403 }))
      .mockResolvedValueOnce(json(attachment({ download_url: `${downloadUrl}2` }))).mockResolvedValueOnce(new Response(new Uint8Array([4, 5])));
    await expect(downloadResendPhoto(emailId, attachmentId, apiKey, AbortSignal.timeout(45_000), fetcher)).rejects.toMatchObject({ code: "provider_invalid_response" });
    expect(await downloadResendPhoto(emailId, attachmentId, apiKey, AbortSignal.timeout(45_000), fetcher)).toEqual(Buffer.from([4, 5]));
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(fetcher).toHaveBeenLastCalledWith(`${downloadUrl}2`, expect.not.objectContaining({ headers: expect.anything() }));
  });
  it("bounds expired URL refresh to one and respects an expired worker deadline", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(attachment())).mockResolvedValueOnce(new Response("expired", { status: 403 }))
      .mockResolvedValueOnce(json(attachment())).mockResolvedValueOnce(new Response("still unavailable", { status: 403 }));
    await expect(downloadResendPhoto(emailId, attachmentId, apiKey, AbortSignal.timeout(45_000), fetcher)).rejects.toMatchObject({ kind: "transient", code: "provider_unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(4);
    const controller = new AbortController();
    const abortedFetcher = vi.fn().mockResolvedValueOnce(json(attachment())).mockImplementationOnce(() => {
      controller.abort(); return Promise.resolve(new Response("expired", { status: 403 }));
    });
    await expect(downloadResendPhoto(emailId, attachmentId, apiKey, controller.signal, abortedFetcher)).rejects.toMatchObject({ code: "aborted" });
    expect(abortedFetcher).toHaveBeenCalledTimes(2);
  });
  it("never follows a CDN redirect or retries a non-expiry rejection", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(attachment())).mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://evil.test" } }));
    await expect(downloadResendPhoto(emailId, attachmentId, apiKey, AbortSignal.timeout(45_000), fetcher)).rejects.toMatchObject({ kind: "permanent", code: "provider_failed" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("bounds actual download bytes regardless of metadata and cancels the stream", async () => {
    const cancel = vi.fn();
    const photo = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1)); }, cancel });
    const fetcher = vi.fn().mockResolvedValueOnce(json(attachment({ size: 1 }))).mockResolvedValueOnce(new Response(photo));
    await expect(downloadResendPhoto(emailId, attachmentId, apiKey, AbortSignal.timeout(45_000), fetcher)).rejects.toMatchObject({ kind: "permanent", code: "attachment_too_large" });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("bounds attachment API JSON before interpreting its temporary URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(attachment({ filename: "x".repeat(16 * 1024) })));
    await expect(downloadResendPhoto(emailId, attachmentId, apiKey, AbortSignal.timeout(45_000), fetcher)).rejects.toMatchObject({ kind: "permanent", code: "provider_response_too_large" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
