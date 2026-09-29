// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { MarketingProviderError, marketingProviderEvidence, resendMarketingContacts, readNativeMarketingTemplate } from "@/lib/marketing/provider";
const id = "5f0d20d5-f4fd-4698-823d-c3b69e757bf3", topic = "61296d74-fad4-4c74-83d3-6a3e17ab9f74";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("uses Resend's topic array wire contract without a contact-wide resubscription", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ id })); vi.stubGlobal("fetch", fetcher);
  await resendMarketingContacts.updateTopic(id, topic, false, "re_synthetic");
  expect(fetcher).toHaveBeenCalledWith(`https://api.resend.com/contacts/${id}/topics`, expect.objectContaining({
    method: "PATCH", body: JSON.stringify([{ id: topic, subscription: "opt_out" }]), cache: "no-store", redirect: "error",
  }));
});
it("admits exactly one address by multipart import with explicit skip and no Topic or Segment writes", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ object: "contact_import", id })); vi.stubGlobal("fetch", fetcher);
  expect(await resendMarketingContacts.createImport("delivered@resend.dev", "re_synthetic")).toBe(id);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith("https://api.resend.com/contacts/imports", expect.objectContaining({
    method: "POST", cache: "no-store", redirect: "error", signal: expect.any(AbortSignal),
  }));
  const options = fetcher.mock.calls[0][1] as RequestInit;
  expect(new Headers(options.headers).get("Content-Type")).toBeNull();
  const body = options.body as FormData;
  expect([...body.keys()].sort()).toEqual(["column_map", "file", "on_conflict"]);
  expect(body.get("on_conflict")).toBe("skip");
  expect(JSON.parse(body.get("column_map") as string)).toEqual({ email: "Email", unsubscribed: "Unsubscribed" });
  const file = body.get("file") as File;
  expect(file.type).toBe("text/csv");
  expect(await file.text()).toBe('Email,Unsubscribed\r\n"delivered@resend.dev",false\r\n');
});
it.each(["one@resend.dev\r\ntwo@resend.dev", "one@resend.dev,two@resend.dev", '"one"@resend.dev', "a".repeat(65) + "@resend.dev"])(
  "rejects an invalid one-record import address before contacting Resend: %s", async (email) => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(resendMarketingContacts.createImport(email, "re_synthetic")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it("permits restrictive Contact updates and rejects all enabling PATCH arguments before the request", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ id })); vi.stubGlobal("fetch", fetcher);
  await resendMarketingContacts.updateContact(id, true, "re_synthetic");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ unsubscribed: true });
  fetcher.mockClear();
  await expect(resendMarketingContacts.updateContact(id, false as true, "re_synthetic")).rejects.toThrow();
  await expect(resendMarketingContacts.updateTopic(id, topic, true as false, "re_synthetic")).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(["queued", "in_progress", "completed", "failed"] as const)("reads a bounded one-record %s import without polling or mutation", async (status) => {
  const counts = { total: 1, created: status === "completed" ? 1 : 0, updated: 0, skipped: 0, failed: status === "failed" ? 1 : 0 };
  const fetcher = vi.fn().mockResolvedValue(Response.json({ object: "contact_import", id, status, counts })); vi.stubGlobal("fetch", fetcher);
  expect(await resendMarketingContacts.readImport(id, "re_synthetic")).toEqual({ id, status, counts });
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(`https://api.resend.com/contacts/imports/${id}`, expect.objectContaining({ method: "GET" }));
});
it("accepts a completed skipped record as skipped, without changing its preferences", async () => {
  const counts = { total: 1, created: 0, updated: 0, skipped: 1, failed: 0 };
  const fetcher = vi.fn().mockResolvedValue(Response.json({ object: "contact_import", id, status: "completed", counts })); vi.stubGlobal("fetch", fetcher);
  expect(await resendMarketingContacts.readImport(id, "re_synthetic")).toEqual({ id, status: "completed", counts });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  { id: topic }, { id: "invalid" }, { status: "unknown" }, { object: "contact" },
  { counts: { total: 2, created: 2, updated: 0, skipped: 0, failed: 0 } },
  { counts: { total: 1, created: 0, updated: 1, skipped: 0, failed: 0 } },
  { counts: { total: 1, created: 1, updated: 0, skipped: 1, failed: 0 } },
  { counts: { total: 1, created: -1, updated: 0, skipped: 0, failed: 0 } },
  { counts: { total: 1, created: 0.5, updated: 0, skipped: 0, failed: 0 } },
  { counts: { total: "1", created: 1, updated: 0, skipped: 0, failed: 0 } },
  { counts: { total: 1, created: 0, updated: 0, skipped: 0 } },
  { counts: { total: 1, created: 0, updated: 0, skipped: 0, failed: 0 } },
  { counts: { total: 0, created: 0, updated: 0, skipped: 0, failed: 0 } },
  { counts: { total: 1, created: 0, updated: 0, skipped: 0, failed: 1 } },
])("rejects mismatched, mutating, or malformed import evidence %#", async (override) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ object: "contact_import", id, status: "completed",
    counts: { total: 1, created: 1, updated: 0, skipped: 0, failed: 0 }, ...override })));
  await expect(resendMarketingContacts.readImport(id, "re_synthetic")).rejects.toThrow();
});
it.each(["opt_in", "opt_out"] as const)("reads the exact Topic default %s without mutation", async (subscription) => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ id: topic, default_subscription: subscription })); vi.stubGlobal("fetch", fetcher);
  expect(await resendMarketingContacts.getTopicDefault(topic, "re_synthetic")).toBe(subscription);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(`https://api.resend.com/topics/${topic}`, expect.objectContaining({ method: "GET" }));
});
it.each([{ id, default_subscription: "opt_in" }, { id: topic }, { id: topic, default_subscription: true }])(
  "rejects unknown or wrongly bound Topic defaults %#", async (value) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(value)));
    await expect(resendMarketingContacts.getTopicDefault(topic, "re_synthetic")).rejects.toThrow();
  },
);
it("bounds import responses, redacts provider failures, and makes no automatic retry", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("x".repeat(16_385)))
    .mockResolvedValueOnce(new Response("provider-private-payload", { status: 503 })); vi.stubGlobal("fetch", fetcher);
  await expect(resendMarketingContacts.readImport(id, "re_synthetic")).rejects.toThrow("Marketing provider needs operator attention.");
  await expect(resendMarketingContacts.createImport("delivered@resend.dev", "re_synthetic")).rejects.toThrow("Marketing provider needs operator attention.");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("distinguishes a missing Contact from a failed provider lookup", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  expect(await resendMarketingContacts.getContact(id, "re_synthetic")).toBeNull();
  await expect(resendMarketingContacts.getContact(id, "re_synthetic")).rejects.toThrow();
});
it("rejects absent Topic evidence and bounds native template reads", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ data: [], has_more: false }))
    .mockResolvedValueOnce(new Response("x".repeat(600_001))));
  await expect(resendMarketingContacts.getTopic(id, topic, "re_synthetic")).rejects.toThrow();
  await expect(readNativeMarketingTemplate(id, "re_synthetic")).rejects.toThrow();
});
it.each([
  [429, "rate_limit_exceeded", "rate_limited"],
  [429, "daily_quota_exceeded", "quota_exceeded"],
  [429, "monthly_quota_exceeded", "quota_exceeded"],
  [401, "restricted_api_key", "configuration_rejected"],
  [422, "invalid_parameter", "configuration_rejected"],
  [500, "application_error", "provider_unavailable"],
  [503, "service_unavailable", "provider_unavailable"],
] as const)("retains sanitized %i %s operator evidence without replaying an import", async (status, name, category) => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ name, message: "private@resend.dev re_private", statusCode: status }, {
    status, headers: { "Retry-After": "12" },
  })); vi.stubGlobal("fetch", fetcher);
  const error = await resendMarketingContacts.createImport("delivered@resend.dev", "re_synthetic").catch((value: unknown) => value);
  expect(error).toBeInstanceOf(MarketingProviderError);
  expect(marketingProviderEvidence(error)).toEqual({ category, httpStatus: status, providerName: name, retryAfterSeconds: 12 });
  expect(String(error)).not.toContain("private");
  expect(JSON.stringify(error)).not.toContain("private");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  { object: "contact_import", id }, { id }, { id: null }, { object: null },
  { statusCode: 200 }, { statusCode: "429" }, { statusCode: null },
  { message: { id } }, { message: null }, { message: 429 }, { extra: "private@resend.dev" },
])("treats contradictory or malformed 429 bodies as uncertain %#", async (extra) => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ name: "rate_limit_exceeded", ...extra }, {
    status: 429, headers: { "Retry-After": "12" },
  }));
  vi.stubGlobal("fetch", fetcher);
  const error = await resendMarketingContacts.createImport("delivered@resend.dev", "re_synthetic").catch((value: unknown) => value);
  expect(marketingProviderEvidence(error)).toEqual({ category: "provider_unavailable", httpStatus: 429, providerName: null, retryAfterSeconds: 12 });
  expect(JSON.stringify(error)).not.toContain(id);
  expect(JSON.stringify(error)).not.toContain("private");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  [429, JSON.stringify({ name: "private@resend.dev" }), "provider_unavailable"],
  [429, "malformed private@resend.dev", "provider_unavailable"],
  [429, "x".repeat(16_385), "provider_unavailable"],
  [422, JSON.stringify({ name: "unknown_column_mapping_error", message: "private@resend.dev" }), "configuration_rejected"],
  [503, JSON.stringify({ name: "rate_limit_exceeded" }), "provider_unavailable"],
  [418, JSON.stringify({ name: "application_error" }), "provider_unavailable"],
] as const)("drops unexpected names or malformed error payloads at status%i without replay %#", async (status, body, category) => {
  const fetcher = vi.fn().mockResolvedValue(new Response(body, { status })); vi.stubGlobal("fetch", fetcher);
  const error = await resendMarketingContacts.createImport("delivered@resend.dev", "re_synthetic").catch((value: unknown) => value);
  expect(marketingProviderEvidence(error)).toEqual({ category, httpStatus: status === 418 ? null : status, providerName: null, retryAfterSeconds: null });
  expect(JSON.stringify(error)).not.toContain("private");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(["-1", "1.5", "86401", "999999999999999999", "Wed, 01 Jan 2030 00:00:00 GMT", "private@resend.dev"])(
  "drops invalid or out-of-bound Retry-After metadata: %s", async (retryAfter) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ name: "rate_limit_exceeded" }, {
      status: 429, headers: { "Retry-After": retryAfter },
    })));
    const error = await resendMarketingContacts.createImport("delivered@resend.dev", "re_synthetic").catch((value: unknown) => value);
    expect(marketingProviderEvidence(error).retryAfterSeconds).toBeNull();
  },
);
it.each(["0", "86400"])("retains bounded integer Retry-After metadata: %s", async (retryAfter) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ name: "rate_limit_exceeded" }, {
    status: 429, headers: { "Retry-After": retryAfter },
  })));
  const error = await resendMarketingContacts.createImport("delivered@resend.dev", "re_synthetic").catch((value: unknown) => value);
  expect(marketingProviderEvidence(error).retryAfterSeconds).toBe(Number(retryAfter));
});
it("redacts network failures and treats malformed successful responses as unknown acceptance", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("private@resend.dev re_private"))
    .mockResolvedValueOnce(new Response("private@resend.dev")); vi.stubGlobal("fetch", fetcher);
  for (let attempt = 0; attempt < 2; attempt++) {
    const error = await resendMarketingContacts.createImport("delivered@resend.dev", "re_synthetic").catch((value: unknown) => value);
    expect(marketingProviderEvidence(error)).toEqual({ category: "provider_unavailable", httpStatus: null, providerName: null, retryAfterSeconds: null });
    expect(String(error)).not.toContain("private");
  }
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(marketingProviderEvidence(new Error("private"))).toEqual({ category: "provider_unavailable", httpStatus: null, providerName: null, retryAfterSeconds: null });
});
it.each(["headers", "success_body", "error_body", "contact_body", "contact_missing_body"] as const)(
  "bounds the complete provider call including %s at 3 seconds and never replays", async (stall) => {
    vi.useFakeTimers();
    const stream = new ReadableStream({ cancel: stall === "contact_missing_body" ? () => new Promise(() => {}) : undefined });
    const fetcher = vi.fn().mockImplementation(() => stall === "headers" ? new Promise(() => {})
      : Promise.resolve(new Response(stream, { status: stall === "error_body" ? 429 : stall === "contact_missing_body" ? 404 : 200 })));
    vi.stubGlobal("fetch", fetcher);
    const operation = stall.startsWith("contact") ? resendMarketingContacts.getContact(id, "re_synthetic")
      : resendMarketingContacts.createImport("delivered@resend.dev", "re_synthetic");
    const assertion = expect(operation).rejects.toThrow("Marketing provider needs operator attention.");
    await vi.advanceTimersByTimeAsync(3_000);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  },
);
it("shares one deadline across all Contact Topic pages", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise((resolve) => {
    setTimeout(() => resolve(Response.json({ data: [{ id, subscription: "opt_in" }], has_more: true })), 2_000);
  })).mockResolvedValueOnce(new Response(new ReadableStream()));
  vi.stubGlobal("fetch", fetcher);
  const assertion = expect(resendMarketingContacts.getTopic(id, topic, "re_synthetic")).rejects.toThrow("Marketing provider needs operator attention.");
  await vi.advanceTimersByTimeAsync(3_000);
  await assertion;
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect((fetcher.mock.calls[1][1] as RequestInit).signal?.aborted).toBe(true);
});
it("does not start another Topic page when an aborted fetch resolves late", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise((resolve) => {
    setTimeout(() => resolve(Response.json({ data: [{ id, subscription: "opt_in" }], has_more: true })), 4_000);
  }));
  vi.stubGlobal("fetch", fetcher);
  const assertion = expect(resendMarketingContacts.getTopic(id, topic, "re_synthetic")).rejects.toThrow("Marketing provider needs operator attention.");
  await vi.advanceTimersByTimeAsync(3_000);
  await assertion;
  await vi.advanceTimersByTimeAsync(1_000);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("resolves a later Topic page within the shared deadline", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: [{ id, subscription: "opt_in" }], has_more: true }))
    .mockResolvedValueOnce(Response.json({ data: [{ id: topic, subscription: "opt_out" }], has_more: false }));
  vi.stubGlobal("fetch", fetcher);
  expect(await resendMarketingContacts.getTopic(id, topic, "re_synthetic")).toBe("opt_out");
  expect(fetcher.mock.calls[1][0]).toBe(`https://api.resend.com/contacts/${id}/topics?limit=100&after=${id}`);
  expect(fetcher.mock.calls[0][1].signal).toBe(fetcher.mock.calls[1][1].signal);
});
it.each([200, 429])("aborts an unread oversized declared response body at status %i", async (status) => {
  const fetcher = vi.fn().mockResolvedValue(new Response(new ReadableStream(), {
    status, headers: { "Content-Length": "16385" },
  }));
  vi.stubGlobal("fetch", fetcher);
  await expect(resendMarketingContacts.createImport("delivered@resend.dev", "re_synthetic")).rejects.toThrow("Marketing provider needs operator attention.");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((fetcher.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
});
