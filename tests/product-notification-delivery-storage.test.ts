import { beforeEach, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }));
import { dispatchEmailIntents } from "@/lib/email/delivery";
import { emailDeliveryStorage } from "@/lib/email/storage";
import type { EmailIntent, EmailRequest } from "@/lib/email/types";

const env = { HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted", HELIX_EMAIL_DISPATCH_ENABLED: "true",
  HELIX_EMAIL_SITE_ORIGIN: "https://helixskin.vercel.app", HELIX_EMAIL_PRODUCT_FROM: "Helix <onboarding@resend.dev>",
  HELIX_EMAIL_REPLY_TO: "support@example.test", HELIX_EMAIL_OWNER_RECIPIENT: "owner@example.test",
  HELIX_EMAIL_ALLOW_SIMULATORS: "true", RESEND_API_KEY: "re_synthetic" };
const row: EmailIntent = { id: "f83164ef-c327-44ae-bbb4-bbd25d254abc", environment: "sandbox", purpose: "product_availability",
  recipient: "delivered@resend.dev", requestPayload: null, firstAttemptAt: null, attemptCount: 0,
  idempotencyKey: "sandbox/product_availability/12/2/8", leaseToken: "95667ec4-3f31-450b-85e2-ec6817b6e558",
  receipt: { schemaVersion: 1, enrollmentId: 12, generation: 2, transitionId: 8,
    productId: "cbff59d2-b98d-4da9-9c04-697f98553eac", productName: "Previous Serum", productSlug: "previous-serum" } };

beforeEach(() => vi.clearAllMocks());

it("refreshes current public Product facts before the first render and provider handoff", async () => {
  const current = { ...row, receipt: { ...row.receipt, productName: "Current Serum", productSlug: "current-serum" } };
  client.rpc.mockImplementation((name: string, args: Record<string, unknown>) => ({ abortSignal: async () => {
    if (name === "claim_email_intents") return { data: [row], error: null };
    if (name === "refresh_product_notification_email") return { data: current, error: null };
    if (name === "prepare_email_attempt") return { data: { ...current, requestPayload: args.p_request_payload, firstAttemptAt: new Date().toISOString() }, error: null };
    if (name === "finish_email_attempt") return { data: true, error: null };
    throw new Error("Unexpected storage operation");
  } }));
  const send = vi.fn().mockResolvedValue({ kind: "accepted", id: "synthetic-provider" });
  expect(await dispatchEmailIntents({ storage: emailDeliveryStorage, send, env })).toMatchObject({ accepted: 1 });
  expect(client.rpc).toHaveBeenCalledWith("refresh_product_notification_email", { p_id: row.id, p_lease_token: row.leaseToken });
  expect(send.mock.calls[0][0].text).toContain("https://helixskin.vercel.app/products/current-serum");
  expect(send.mock.calls[0][0].subject).toContain("Current Serum");
  expect(send.mock.calls[0][0].text).not.toContain("previous-serum");
});

it("omits a Product notice when its generation is no longer admitted", async () => {
  client.rpc.mockImplementation((name: string) => ({ abortSignal: async () => {
    if (name === "claim_email_intents") return { data: [row], error: null };
    if (name === "refresh_product_notification_email") return { data: null, error: null };
    throw new Error("Invalidated work must not be prepared");
  } }));
  const send = vi.fn();
  expect(await dispatchEmailIntents({ storage: emailDeliveryStorage, send, env })).toEqual({ claimed: 0, accepted: 0, deferred: 0, blocked: 0 });
  expect(send).not.toHaveBeenCalled();
});

it("never refreshes an already prepared Product request even after a sender or catalog change", async () => {
  const payload: EmailRequest = { from: "Helix <old@example.test>", to: ["delivered@resend.dev"], reply_to: "support@old.example",
    subject: "Original requested update", html: "<p>Original content</p>", text: "Original content", tags: [] };
  const prepared = { ...row, requestPayload: payload, firstAttemptAt: new Date().toISOString(), attemptCount: 1 };
  client.rpc.mockImplementation((name: string) => ({ abortSignal: async () => {
    if (name === "claim_email_intents") return { data: [prepared], error: null };
    if (name === "prepare_email_attempt") return { data: prepared, error: null };
    if (name === "finish_email_attempt") return { data: true, error: null };
    throw new Error("A frozen request cannot refresh catalog facts");
  } }));
  const send = vi.fn().mockResolvedValue({ kind: "accepted", id: "synthetic-provider" });
  expect(await dispatchEmailIntents({ storage: emailDeliveryStorage, send, env: { ...env, HELIX_EMAIL_PRODUCT_FROM: "" } })).toMatchObject({ accepted: 1 });
  expect(send).toHaveBeenCalledWith(payload, row.idempotencyKey, "re_synthetic");
});

it.each([{ id: "another-intent" }, { leaseToken: "another-lease" }, { purpose: "order_confirmation" }])("rejects a refreshed result outside the claimed identity: %j", async (mismatch) => {
  client.rpc.mockImplementation((name: string) => ({ abortSignal: async () => ({ data: name === "claim_email_intents" ? [row] : { ...row, ...mismatch }, error: null }) }));
  const send = vi.fn();
  await expect(dispatchEmailIntents({ storage: emailDeliveryStorage, send, env })).rejects.toThrow("invalid delivery intent");
  expect(send).not.toHaveBeenCalled();
});
