// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { resendMarketingContacts, readNativeMarketingTemplate } from "@/lib/marketing/provider";
const id = "5f0d20d5-f4fd-4698-823d-c3b69e757bf3", topic = "61296d74-fad4-4c74-83d3-6a3e17ab9f74";
afterEach(() => vi.unstubAllGlobals());
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
