import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { productionMarketingTestTarget } from "./helpers/production-marketing-target";
import { POST } from "@/app/api/webhooks/marketing-production/route";
import { receiveProductionMarketingEvent } from "@/lib/production-marketing/events";

vi.mock("@/lib/release/deployment-authorization", () => ({
  productionDeploymentAuthorized: async (env: Record<string, string | undefined>) =>
    env.VERCEL_DEPLOYMENT_ID === "dpl_SyntheticEmailBuild",
}));

const origin = "https://www.helixskin.us";
const database = "https://erasogmsqpgiirovubjh.supabase.co";
const signing = Buffer.from("synthetic-native-callback-signing-secret");
const sender = "hello@helixskin.us";
const recipient = "customer@example.invalid";
const template = "abcd5678-1111-4111-8111-111111111111";
const emailId = "cab01111-2222-4333-8444-555555555555";
const messageId = "eab01111-2222-4333-8444-555555555555";
const topicA = "aaaaaaaa-0000-4000-8000-000000000001";
const topicB = "bbbbbbbb-0000-4000-8000-000000000002";
const rawTags = {
  environment: "production",
  helix_message_id: messageId,
  helix_purpose: "confirmation",
  helix_contract: "production_welcome_delivery_v1",
};
const foreignSender = "support-fixture@helixskin.us";
const privateProfile = "Private customer profile";
const preferenceRpc = "record_direct_production_marketing_preference";
const strictRpc = "record_direct_production_marketing_event";
const holdRpc = "hold_direct_production_marketing_receipt";
const rawRpc = "record_production_marketing_event";
const occurredAt = "2024-04-13T12:10:09.000Z";
const eventId = "msg_synthetic_native";
const env = {
  ...productionMarketingTestTarget,
  HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED: "true",
  HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET: "whsec_" + signing.toString("base64"),
  HELIX_PRODUCTION_MARKETING_ENABLED: "false",
};

function signed(event: unknown, options: { origin?: string; alter?: boolean } = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify(event);
  const signature = createHmac("sha256", signing).update([eventId, timestamp, body].join(".")).digest("base64");
  return new Request((options.origin ?? origin) + "/api/webhooks/marketing-production", {
    method: "POST",
    body: options.alter ? body + " " : body,
    headers: { "svix-id": eventId, "svix-timestamp": timestamp, "svix-signature": "v1," + signature },
  });
}

function contact(fields: Record<string, unknown>) {
  return { type: "contact.updated", created_at: occurredAt, data: { email: recipient, ...fields } };
}

function delivery(type: string, fields: Record<string, unknown> = {}) {
  return {
    type,
    created_at: occurredAt,
    data: { email_id: emailId, from: sender, to: [recipient], subject: privateProfile, ...fields },
  };
}

function topics(rows: unknown) {
  return {
    type: "contact.topics.updated",
    created_at: occurredAt,
    data: { email: recipient, topics: rows, last_name: privateProfile },
  };
}

const ledger: { name: string; args: Record<string, unknown> }[] = [];
let outcomes: Record<string, unknown>;
beforeEach(() => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  ledger.length = 0;
  outcomes = { [preferenceRpc]: "applied", [holdRpc]: "held", [rawRpc]: "recorded", [strictRpc]: "recorded" };
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const prefix = database + "/rest/v1/rpc/";
    const name = url.startsWith(prefix) ? url.slice(prefix.length) : "";
    if (!Object.hasOwn(outcomes, name) || init.method !== "POST" || init.redirect !== "error")
      throw new Error("External network forbidden");
    const headers = new Headers(init.headers);
    expect(headers.get("apikey")).toBe(env.SUPABASE_SERVICE_ROLE_KEY);
    expect(headers.has("authorization")).toBe(false);
    ledger.push({ name, args: JSON.parse(String(init.body)) });
    if (outcomes[name] instanceof Error) throw outcomes[name];
    return Response.json(outcomes[name]);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function accepted(event: unknown) {
  const response = await POST(signed(event));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}
describe("dedicated signed direct marketing intake", () => {
  it.each(["contact.created", "contact.updated"])(
    "retains a signed %s global denial during an enrollment pause",
    async (type) => {
      const event = { ...contact({ unsubscribed: true, first_name: privateProfile }), type };
      await accepted(event);
      outcomes[preferenceRpc] = "duplicate";
      await accepted(event);
      const expected = {
        name: preferenceRpc,
        args: {
          p_event_id: eventId,
          p_event_type: type,
          p_occurred_at: occurredAt,
          p_email: recipient,
          p_global_denied: true,
          p_denied_topics: [],
          p_ambiguous: false,
        },
      };
      expect(ledger).toEqual([expected, expected]);
    },
  );

  it("passes only deduplicated, sorted opt-outs to the database for comparison to its pinned Topic", async () => {
    await accepted(
      topics([
        { id: topicB, subscription: "opt_out" },
        { id: topicA.toUpperCase(), subscription: "opt_out" },
        { id: template, subscription: "opt_in" },
        { id: topicA, subscription: "opt_out" },
      ]),
    );
    expect(ledger).toEqual([
      {
        name: preferenceRpc,
        args: {
          p_event_id: eventId,
          p_event_type: "contact.topics.updated",
          p_occurred_at: occurredAt,
          p_email: recipient,
          p_global_denied: false,
          p_denied_topics: [topicA, topicB],
          p_ambiguous: false,
        },
      },
    ]);
  });

  it.each([
    contact({ unsubscribed: "true" }),
    contact({ unsubscribed: true, email: null }),
    topics([{ id: topicA, subscription: "unknown" }]),
    topics([{ id: topicA, subscription: ["opt_out"] }]),
    topics({ id: topicA, subscription: "opt_out" }),
    topics([
      { id: topicA, subscription: "opt_in" },
      { id: topicA, subscription: "opt_out" },
    ]),
    topics(
      Array.from({ length: 101 }, (_, i) => ({
        id: "aaaaaaaa-0000-4000-8000-" + String(i).padStart(12, "0"),
        subscription: "opt_out",
      })),
    ),
  ])("retains an ambiguous preference without attributing it to a person", async (event) => {
    outcomes[preferenceRpc] = "held";
    await accepted(event);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ name: preferenceRpc, args: { p_email: null, p_ambiguous: true } });
    expect(JSON.stringify(ledger)).not.toContain(privateProfile);
  });
  it("preserves an explicit global denial with an invalid event time and requests private reconciliation", async () => {
    await accepted({ ...contact({ unsubscribed: true }), created_at: "2024-02-31T12:00:00Z" });
    expect(ledger[0].args).toMatchObject({
      p_occurred_at: null,
      p_global_denied: true,
      p_email: recipient,
      p_ambiguous: true,
    });
  });
  it("ignores positive contacts, affirmative topics and untagged human or unrelated delivery", async () => {
    for (const event of [
      contact({ unsubscribed: false }),
      topics([{ id: topicA, subscription: "opt_in" }]),
      delivery("email.bounced"),
      delivery("email.suppressed", { from: foreignSender, to: [recipient] }),
      delivery("email.complained", { tags: { helix_support_outbox: messageId } }),
      delivery("email.delivered"),
    ])
      await accepted(event);
    expect(ledger).toEqual([]);
  });

  it.each(["email.bounced", "email.complained", "email.suppressed", "email.delivered"])(
    "passes the exact signed %s envelope to private accepted-message matching",
    async (type) => {
      await accepted(delivery(type, { tags: rawTags }));
      expect(ledger).toEqual([
        {
          name: strictRpc,
          args: {
            p_event_id: eventId,
            p_event_type: type,
            p_occurred_at: occurredAt,
            p_provider_id: emailId,
            p_message_id: messageId,
            p_sender: sender,
            p_recipient: recipient,
            p_environment: "production",
            p_purpose: "confirmation",
            p_contract_version: "production_welcome_delivery_v1",
          },
        },
      ]);
    },
  );
  it.each([
    { tags: { ...rawTags, helix_support_outbox: messageId } },
    { tags: { ...rawTags, arbitrary: "other" } },
    { tags: { ...rawTags, helix_environment: "sandbox" } },
    { tags: { helix_message_id: messageId } },
    { tags: { ...rawTags, helix_purpose: "other" } },
    { tags: { helix_future_namespace: "unknown" } },
    { tags: { helix_environment: "sandbox", helix_purpose: "welcome" } },
    { tags: [{ name: "helix_message_id", value: messageId }] },
    { tags: rawTags, to: [recipient, recipient] },
    { tags: rawTags, cc: [recipient] },
    { tags: rawTags, bcc: [recipient] },
    { tags: rawTags, template_id: template },
    { tags: rawTags, broadcast_id: template },
    { tags: rawTags, email_id: "bad" },
  ])("preserves a claimed, ambiguous negative with only its bounded identities", async (fields) => {
    await accepted(delivery("email.bounced", fields));
    expect(ledger).toEqual([
      {
        name: holdRpc,
        args: {
          p_event_id: eventId,
          p_provider_id: "email_id" in fields ? null : emailId,
          p_message_id: Object.hasOwn(fields.tags, "helix_message_id") ? messageId : null,
        },
      },
    ]);
  });
  it("keeps the historical prepared receipt boundary for a different marketing sender", async () => {
    await accepted(delivery("email.delivered", { from: foreignSender, tags: rawTags }));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ name: rawRpc, args: { p_message_id: messageId, p_provider_id: emailId } });
  });

  it.each(["paused", null, "unexpected", new Error(privateProfile)])(
    "retries a closed or unavailable restriction store without leaking its input",
    async (outcome) => {
      outcomes[preferenceRpc] = outcome;
      const result = await POST(signed(contact({ unsubscribed: true })));
      expect(result.status).toBe(503);
      expect(await result.json()).toEqual({ ok: false });
    },
  );
  it("retries a privately held receipt when storage is closed", async () => {
    outcomes[holdRpc] = "paused";
    expect((await POST(signed(delivery("email.bounced", { tags: { helix_message_id: messageId } })))).status).toBe(
      503,
    );
  });
  it("verifies origin, deployment and signature before private calls", async () => {
    const event = contact({ unsubscribed: true });
    expect((await POST(signed(event, { alter: true }))).status).toBe(400);
    expect((await POST(signed(event, { origin: "https://helixskin.vercel.app" }))).status).toBe(403);
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_wrong");
    expect((await POST(signed(event))).status).toBe(503);
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", env.VERCEL_DEPLOYMENT_ID);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await POST(signed(event))).status).toBe(503);
    expect(ledger).toEqual([]);
  });
  it.each(["HELIX_PRODUCTION_EMAIL_GATEWAY_WEBHOOK_SECRET", "HELIX_PRODUCTION_SUPPORT_SENT_WEBHOOK_SECRET"])(
    "requires a distinct standalone signature from %s",
    async (key) => {
      vi.stubEnv(key, env.HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET);
      expect((await POST(signed(contact({ unsubscribed: true })))).status).toBe(503);
      expect(ledger).toEqual([]);
    },
  );
  it("keeps the raw-only shared delegate scoped to its own traffic", async () => {
    const record = vi.fn();
    expect(
      (await receiveProductionMarketingEvent(signed(contact({ unsubscribed: true })), { env, record })).status,
    ).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });
});
