import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/marketing-production/route";
import { receiveProductionMarketingEvent } from "@/lib/production-marketing/events";

vi.mock("@/lib/release/deployment-authorization", () => ({
  productionDeploymentAuthorized: async (env: Record<string, string | undefined>) =>
    env.VERCEL_DEPLOYMENT_ID === "dpl_SyntheticRestrictionReceiver",
}));

const origin = "https://www.helixskin.us";
const database = "https://erasogmsqpgiirovubjh.supabase.co";
const signing = Buffer.from("synthetic-native-callback-signing-secret");
const sender = "welcome-fixture@updates.helixskin.us";
const recipient = "customer@example.invalid";
const contract = "a".repeat(64);
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
const nativeRpc = "record_native_welcome_restriction";
const rawRpc = "record_production_marketing_event";
const occurredAt = "2024-04-13T12:10:09.000Z";
const eventId = "msg_synthetic_native";
const env = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_SyntheticRestrictionStorefront",
  VERCEL_DEPLOYMENT_ID: "dpl_SyntheticRestrictionReceiver",
  VERCEL_PROJECT_PRODUCTION_URL: "helixskin.us",
  HELIX_PRODUCTION_MARKETING_SITE_ORIGIN: origin,
  HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID: "prj_SyntheticRestrictionStorefront",
  HELIX_PRODUCTION_MARKETING_SUPABASE_URL: database,
  HELIX_PRODUCTION_MARKETING_SERVICE_KEY: "synthetic-restrictions-only",
  HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED: "true",
  HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET: "whsec_" + signing.toString("base64"),
  HELIX_PRODUCTION_MARKETING_NATIVE_CONTRACT_SHA256: contract,
  HELIX_PRODUCTION_MARKETING_NATIVE_SENDER: sender,
  HELIX_PRODUCTION_MARKETING_NATIVE_TEMPLATE_ID: template,
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

function restriction(type: string, fields: Record<string, unknown>) {
  return {
    name: nativeRpc,
    args: {
      p_contract_hash: contract,
      p_event_id: eventId,
      p_event_type: type,
      p_occurred_at: occurredAt,
      p_sender: null,
      p_recipient: null,
      p_global_denied: false,
      p_denied_topic_ids: [],
      p_ambiguity: null,
      ...fields,
    },
  };
}

async function accepted(request: Request) {
  const response = await POST(request);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ ok: true });
}

const ledger: { name: string; args: Record<string, unknown> }[] = [];
let nativeResult: unknown;
let rawResult: unknown;
beforeEach(() => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  ledger.length = 0;
  nativeResult = "applied";
  rawResult = "recorded";
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const prefix = database + "/rest/v1/rpc/";
    const name = url.startsWith(prefix) ? url.slice(prefix.length) : "unexpected";
    ledger.push({ name, args: JSON.parse(String(init.body)) });
    if (![nativeRpc, rawRpc].includes(name) || init.method !== "POST")
      throw new Error("Unexpected fixture transport");
    if (nativeResult instanceof Error && name === nativeRpc) throw nativeResult;
    return Response.json(name === rawRpc ? rawResult : nativeResult);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("signed native restrictions at the dedicated production webhook", () => {
  it("records a global denial during an enrollment pause without retaining the contact profile", async () => {
    await accepted(signed(contact({ unsubscribed: true, first_name: privateProfile })));
    expect(ledger).toEqual([restriction("contact.updated", { p_recipient: recipient, p_global_denied: true })]);
  });

  it("withholds the delivery recipient when the local native qualification is missing", async () => {
    vi.stubEnv("HELIX_PRODUCTION_MARKETING_NATIVE_CONTRACT_SHA256", "");
    nativeResult = "held";
    await accepted(signed(delivery("email.bounced")));
    expect(ledger).toEqual([restriction("email.bounced", {
      p_contract_hash: null, p_sender: sender, p_ambiguity: "ownership_conflict",
    })]);
  });

  it("forwards only unique explicit Topic denials, normalized and sorted", async () => {
    const denial = { id: topicA.toUpperCase(), subscription: "opt_out" };
    await accepted(
      signed(
        topics([
          { id: topicB, subscription: "opt_out" },
          denial,
          { ...denial, id: topicA },
          { id: template, subscription: "opt_in" },
        ]),
      ),
    );
    expect(ledger).toEqual([
      restriction("contact.topics.updated", {
        p_recipient: recipient,
        p_denied_topic_ids: [topicA, topicB],
      }),
    ]);
  });

  it.each([
    ["non-boolean global denial", contact({ unsubscribed: "true" })],
    ["missing address on a denial", contact({ unsubscribed: true, email: null })],
    ["unrecognized topic status", topics([{ id: topicA, subscription: "subscribed" }])],
    [
      "contradictory topic preferences",
      topics([
        { id: topicA, subscription: "opt_out" },
        { id: topicA, subscription: "opt_in" },
      ]),
    ],
    ["malformed topic container", topics({ id: topicA, subscription: "opt_out" })],
    [
      "excessive denial list",
      topics(
        Array.from({ length: 101 }, (_, i) => ({
          id: "aaaaaaaa-0000-4000-8000-" + String(i).padStart(12, "0"),
          subscription: "opt_out",
        })),
      ),
    ],
  ])("durably acknowledges a hold for %s", async (_, event) => {
    nativeResult = "held";
    await accepted(signed(event));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ name: nativeRpc, args: { p_recipient: null, p_ambiguity: "invalid_contact_deny" } });
    expect(JSON.stringify(ledger)).not.toContain(privateProfile);
  });

  it.each([
    [contact({ unsubscribed: true }), "invalid_contact_deny"],
    [delivery("email.complained"), "invalid_restrictive_envelope"],
  ])("records a hold without inventing an occurrence time", async (event, ambiguity) => {
    nativeResult = "held";
    await accepted(signed({ ...event, created_at: "2024-02-31T12:00:00Z" }));
    expect(ledger).toHaveLength(1);
    expect(ledger[0].args).toMatchObject({ p_occurred_at: null, p_ambiguity: ambiguity });
  });

  it.each(["email.bounced", "email.complained", "email.suppressed"])(
    "passes the one recipient of an exclusive native %s without provider PII",
    async (type) => {
      await accepted(
        signed(
          delivery(type, {
            from: "Qualified Marketing <" + sender + ">",
            to: ["Fixture <" + recipient + ">"],
            cc: [],
            bcc: [],
            template_id: template,
            tags: { campaign: "fixture" },
          }),
        ),
      );
      expect(ledger).toEqual([restriction(type, { p_sender: sender, p_recipient: recipient })]);
    },
  );

  it.each([
    ["multiple recipients", { to: [recipient, "other@example.invalid"] }, "recipient_ambiguous"],
    ["carbon copy", { cc: ["carbon@example.invalid"] }, "recipient_ambiguous"],
    ["blind carbon copy", { bcc: ["blind@example.invalid"] }, "recipient_ambiguous"],
    ["malformed BCC shape", { bcc: "blind@example.invalid" }, "recipient_ambiguous"],
    ["mailbox list as display name", { to: ["other@example.invalid <" + recipient + ">"] }, "recipient_ambiguous"],
    ["sender array", { from: [sender] }, "invalid_restrictive_envelope"],
    [
      "sender list in display name",
      { from: ["support@example.invalid", "<" + sender + ">"].join(" ") },
      "invalid_restrictive_envelope",
    ],
    ["missing provider email identity", { email_id: null }, "invalid_restrictive_envelope"],
    [
      "native template from unrelated sender",
      { from: foreignSender, template_id: template },
      "ownership_conflict",
    ],
    [
      "same native template in uppercase from foreign sender",
      { from: foreignSender, template_id: template.toUpperCase() },
      "ownership_conflict",
    ],
    ["other template from native sender", { template_id: messageId }, "ownership_conflict"],
    ["broadcast from native sender", { broadcast_id: messageId }, "ownership_conflict"],
    ["conflicting Helix owner", { tags: { helix_owner: "support" } }, "ownership_conflict"],
  ])("holds %s without retaining any candidate recipient", async (_, fields, ambiguity) => {
    nativeResult = "held";
    await accepted(signed(delivery("email.bounced", fields)));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ name: nativeRpc, args: { p_recipient: null, p_ambiguity: ambiguity } });
    expect(JSON.stringify(ledger)).not.toContain(recipient);
    expect(JSON.stringify(ledger)).not.toContain(privateProfile);
  });

  it.each([
    "support-fixture@helixskin.us",
    "auth-fixture@helixskin.us",
    "payments@example.invalid",
    "unrelated@example.invalid",
  ])("projects only the sender of unrelated restrictive evidence from %s", async (from) => {
    nativeResult = "ignored";
    await accepted(signed(delivery("email.suppressed", { from, cc: ["copy@example.invalid"] })));
    expect(ledger).toEqual([restriction("email.suppressed", { p_sender: from })]);
  });

  it("never projects positive contacts, Topic opt-ins or unowned positive deliveries into receipt storage", async () => {
    for (const event of [
      contact({ unsubscribed: false }),
      topics([{ id: topicA, subscription: "opt_in" }]),
      delivery("email.delivered"),
    ]) {
      await accepted(signed(event));
    }
    expect(ledger).toEqual([]);
  });

  it("rechecks origin, deployment and signature before the first privileged storage call", async () => {
    const event = contact({ unsubscribed: true });
    expect((await POST(signed(event, { alter: true }))).status).toBe(400);
    expect((await POST(signed(event, { origin: "https://helixskin.vercel.app" }))).status).toBe(403);
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_foreign");
    expect((await POST(signed(event))).status).toBe(503);
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", env.VERCEL_DEPLOYMENT_ID);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await POST(signed(event))).status).toBe(503);
    expect(ledger).toEqual([]);
  });

  it("reuses the signed event identity on a retry and acknowledges a durable duplicate", async () => {
    const event = contact({ unsubscribed: true });
    await accepted(signed(event));
    nativeResult = "duplicate";
    await accepted(signed(event));
    expect(ledger).toHaveLength(2);
    expect(ledger[1]).toEqual(ledger[0]);
    expect(ledger[0].args.p_event_id).toBe(eventId);
  });

  it.each(["undocumented-outcome", null, new Error(privateProfile)])(
    "retries an unavailable or unknown storage outcome with a generic response",
    async (outcome) => {
      nativeResult = outcome;
      const response = await POST(signed(contact({ unsubscribed: true })));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false });
    },
  );

  it("preserves the signed tagged raw receipt at its existing storage boundary", async () => {
    await accepted(signed(delivery("email.delivered", { from: foreignSender, tags: rawTags })));
    expect(ledger).toEqual([
      {
        name: rawRpc,
        args: {
          p_event_id: eventId,
          p_message_id: messageId,
          p_provider_id: emailId,
          p_event_type: "email.delivered",
          p_occurred_at: occurredAt,
          p_sender: foreignSender,
          p_recipient: recipient,
          p_purpose: "confirmation",
          p_contract_version: "production_welcome_delivery_v1",
          p_environment: "production",
        },
      },
    ]);
    ledger.length = 0;
    const invalid = await POST(
      signed(delivery("email.delivered", { from: foreignSender, tags: { ...rawTags, helix_message_id: "bad" } })),
    );
    expect(invalid.status).toBe(400);
    expect(ledger).toEqual([]);
  });

  it("persists both a signed ownership collision and the existing prepared receipt, retrying unknown storage", async () => {
    const event = delivery("email.complained", { tags: rawTags });
    nativeResult = "held";
    await accepted(signed(event));
    expect(ledger).toHaveLength(2);
    expect(ledger).toContainEqual(
      restriction("email.complained", { p_sender: sender, p_ambiguity: "ownership_conflict" }),
    );
    expect(ledger).toContainEqual({
      name: rawRpc,
      args: expect.objectContaining({ p_message_id: messageId, p_provider_id: emailId }),
    });
    ledger.length = 0;
    nativeResult = new Error(privateProfile);
    const response = await POST(signed(event));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(ledger).toHaveLength(2);
    expect(ledger.map((entry) => entry.name).sort()).toEqual([nativeRpc, rawRpc].sort());
    ledger.length = 0;
    nativeResult = "duplicate";
    rawResult = "unknown";
    const rawUnavailable = await POST(signed(event));
    expect(rawUnavailable.status).toBe(503);
    expect(await rawUnavailable.json()).toEqual({ ok: false });
    expect(ledger.map((entry) => entry.name).sort()).toEqual([nativeRpc, rawRpc].sort());
  });

  it("retains the restriction hold when incomplete raw tags are rejected", async () => {
    nativeResult = "held";
    const response = await POST(signed(delivery("email.bounced", { tags: { helix_message_id: messageId } })));
    expect(response.status).toBe(400);
    expect(ledger).toEqual([
      restriction("email.bounced", { p_sender: sender, p_ambiguity: "ownership_conflict" }),
    ]);
  });

  it.each(["HELIX_PRODUCTION_EMAIL_GATEWAY_WEBHOOK_SECRET", "HELIX_PRODUCTION_SUPPORT_SENT_WEBHOOK_SECRET"])(
    "rejects signing credentials shared with %s before accessing storage",
    async (key) => {
      vi.stubEnv(key, env.HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET);
      const response = await POST(signed(contact({ unsubscribed: true })));
      expect(response.status).toBe(503);
      expect(ledger).toEqual([]);
    },
  );

  it("keeps the shared receiver without a native delegate restricted to tagged raw traffic", async () => {
    const record = vi.fn().mockResolvedValue("recorded");
    for (const event of [contact({ unsubscribed: true }), delivery("email.bounced")]) {
      const response = await receiveProductionMarketingEvent(signed(event), { env, record });
      expect(response.status).toBe(400);
    }
    expect(record).not.toHaveBeenCalled();
    expect(ledger).toEqual([]);
  });
});
