import { afterEach, expect, it, vi } from "vitest";
import { sendResendEmail } from "@/lib/email/provider";
import type { EmailRequest } from "@/lib/email/types";

const payload: EmailRequest = { from: "Helix <onboarding@resend.dev>", to: ["delivered@resend.dev"],
  reply_to: "support@example.test", subject: "DEMO", html: "<p>Demo</p>", text: "Demo", tags: [] };
afterEach(() => vi.unstubAllGlobals());
it("sends only the frozen request with a bounded deadline and stable idempotency header", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "4e0fc110-e3e0-40e0-843b-09dc315a3a2d" }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  expect(await sendResendEmail(payload, "stable-key", "re_synthetic")).toEqual({ kind: "accepted", id: "4e0fc110-e3e0-40e0-843b-09dc315a3a2d" });
  expect(fetch).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ body: JSON.stringify(payload),
    redirect: "error", cache: "no-store", signal: expect.any(AbortSignal),
    headers: expect.objectContaining({ "Idempotency-Key": "stable-key" }) }));
});
it.each([[429, "retry"], [401, "blocked"], [403, "blocked"], [422, "failed"], [500, "uncertain"], [503, "uncertain"], [409, "uncertain"]])(
  "classifies provider status %s without exposing its private response", async (status, kind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("customer@example.test secret provider details", { status: Number(status) })));
    expect(await sendResendEmail(payload, "stable-key", "re_synthetic")).toEqual({ kind, code: `provider_http_${status}` });
  },
);
it("retains uncertainty after a timeout, malformed success, or oversized success", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error("private secret"))
    .mockResolvedValueOnce(new Response("not json"))
    .mockResolvedValueOnce(new Response("x".repeat(16_385)));
  vi.stubGlobal("fetch", fetch);
  for (let attempt = 0; attempt < 3; attempt++) expect(await sendResendEmail(payload, "stable-key", "re_synthetic")).toEqual({ kind: "uncertain", code: "provider_connection_uncertain" });
});
