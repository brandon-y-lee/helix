import { createHash, createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import { GET as status, POST as subscribe } from "@/app/api/marketing/production/subscription/route";
import { POST as confirm } from "@/app/api/marketing/production/confirm/route";
import { POST as withdraw } from "@/app/api/marketing/production/preferences/route";
import { POST as oneClick } from "@/app/api/marketing/production/unsubscribe/route";
import { POST as scheduledDispatch } from "@/app/api/internal/marketing/production/maintenance/route";
import { POST as callback } from "@/app/api/webhooks/marketing-production/route";
import { GET as confirmationPage } from "@/app/marketing/production/confirm/route";
import { GET as preferencePage } from "@/app/marketing/production/preferences/route";
import { GET as readOperatorStatus } from "@/app/api/internal/marketing/production/status/route";
import { productionSignupQualification } from "@/lib/production-marketing/storage";
import { directMarketingDeliveryContract } from "@/lib/production-marketing/delivery-config";
import { HELIX_VERCEL_PROJECT_ID, supabaseOriginForTarget } from "@/lib/supabase/project-safety";
import { journeyServiceKey, rpcFixture, sql } from "./direct-welcome-journey-pg";

// Only the already-authenticated identity is synthetic. PostgreSQL decides active Operator membership.
const currentUser = vi.hoisted(() => vi.fn<() => Promise<{ id: string } | null>>());
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  getCurrentUser: currentUser,
}));

const origin = "https://www.helixskin.us";
const topic = "aca091c7-8da7-440e-8761-e6a549c60aa5";
const sender = "hello@helixskin.us";
const signup = "/api/marketing/production/subscription";
const signing = Buffer.from("synthetic-direct-journey-callback-only");
const anon = "sb_publishable_direct_journey_synthetic";
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const accounts = [
  "visible-withdrawal@example.invalid",
  "mailbox-withdrawal@example.invalid",
  "previously-denied@example.invalid",
] as const;
type Customer = (typeof accounts)[number];
const [visible, mailbox, previouslyDenied] = accounts;
const runtime = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_TARGET_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
  VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  VERCEL_PROJECT_ID: HELIX_VERCEL_PROJECT_ID,
  VERCEL_DEPLOYMENT_ID: "dpl_SyntheticDirect",
  VERCEL_PROJECT_PRODUCTION_URL: "www.helixskin.us",
  NEXT_PUBLIC_SUPABASE_URL: supabaseOriginForTarget("production"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
  HELIX_PRODUCTION_SUPABASE_ANON_KEY_SHA256: digest(anon),
  SUPABASE_SERVICE_ROLE_KEY: journeyServiceKey,
  HELIX_PRODUCTION_SUPABASE_SERVICE_ROLE_KEY_SHA256: digest(journeyServiceKey),
  HELIX_PRODUCTION_MARKETING_ENABLED: "true",
  HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED: "true",
  HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED: "true",
  HELIX_PRODUCTION_MARKETING_ABUSE_KEY: "1".repeat(64),
  HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY: "2".repeat(64),
  HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID: "journey",
  CRON_SECRET: "journey-schedule-".repeat(3),
  HELIX_PRODUCTION_MARKETING_WORKER_TOKEN: "direct-worker-".repeat(4),
  HELIX_PRODUCTION_MARKETING_PROVIDER_KEY: "re_" + "synthetic".repeat(4),
  HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET: "whsec_" + signing.toString("base64"),
};

const enroll = (email: Customer) =>
  subscribe(
    new Request(origin + signup, {
      method: "POST",
      headers: { origin, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.15" },
      body: JSON.stringify({ email, consent: true }),
    }),
  );
const state = (email: Customer) =>
  sql(`SELECT state FROM private.production_marketing_subscribers WHERE normalized_email='${email}';`);
const tick = async () => {
  const response = await scheduledDispatch(
    new Request(origin + "/api/internal/marketing/production/maintenance", {
      method: "POST",
      headers: { authorization: "Bearer " + runtime.CRON_SECRET },
    }),
  );
  expect(response.status).toBe(200);
  return (await response.json()).status;
};

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: { url: string; runScripts: "dangerously" }) => { window: Window };
};

async function customerClick(url: URL, kind: "confirm" | "preferences") {
  expect(url.origin).toBe(origin);
  expect(url.pathname).toBe("/marketing/production/" + kind);
  const rendered = await (kind === "confirm" ? confirmationPage() : preferencePage());
  // The actual page script extracts its fragment locally. JSDOM loads no external resources.
  const { window } = new JSDOM(await rendered.text(), { url: url.href, runScripts: "dangerously" });
  try {
    let submissions = 0;
    window.fetch = async (path, options) => {
      submissions++;
      expect(path).toBe("/api/marketing/production/" + kind);
      expect(options?.method).toBe("POST");
      const headers = new Headers(options?.headers);
      headers.set("origin", origin);
      const request = new Request(origin + path, { method: "POST", headers, body: options?.body });
      return kind === "confirm" ? confirm(request) : withdraw(request);
    };
    expect(window.location.hash).toBe("");
    const button = window.document.querySelector("button");
    expect(button?.textContent).toBe(kind === "confirm" ? "Confirm subscription" : "Unsubscribe from marketing");
    expect(button?.disabled).toBe(false);
    button!.click();
    await vi.waitFor(() => {
      const feedback = window.document.getElementById("feedback");
      expect(feedback?.textContent).toContain(
        kind === "confirm" ? "consent is confirmed" : "withdrawal has been recorded",
      );
    });
    expect(submissions).toBe(1);
  } finally {
    window.close();
  }
}

function signedContact(id: string, data: Record<string, unknown>): Request {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    type: "contact.updated",
    created_at: occurredAt,
    data,
  });
  const signature = createHmac("sha256", signing).update([id, timestamp, body].join(".")).digest("base64");
  return new Request(origin + "/api/webhooks/marketing-production", {
    method: "POST",
    body,
    headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": "v1," + signature },
  });
}
const occurredAt = new Date().toISOString();

type Message = {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  text: string;
  html: string;
  topic_id?: string;
  headers: Record<string, string>;
  tags: Array<{ name: string; value: string }>;
};
function emailLink(message: Message, page: "confirm" | "preferences") {
  const path = "/marketing/production/" + page + "#token=";
  const match = message.text.match(
    /https:\/\/www\.helixskin\.us\/marketing\/production\/(?:confirm|preferences)#token=[a-zA-Z0-9_-]{43}/g,
  );
  const href = match?.find((item) => item.includes(path));
  expect(Boolean(href && message.html.includes('href="' + href + '"'))).toBe(true);
  return new URL(href!);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("confirms two new customers, sends one direct welcome each and enforces both withdrawals and signed global denials", async () => {
  for (const [key, value] of Object.entries(runtime)) vi.stubEnv(key, value);
  const binding = productionSignupQualification(runtime);
  const contract = JSON.stringify(directMarketingDeliveryContract);
  expect(contract).not.toContain("'");
  expect(digest(contract)).toBe(binding.p_contract_hash);
  sql(`UPDATE private.production_marketing_direct_policy SET topic_default='opt_in', baseline_evidence_sha256=repeat('b',64), intake_evidence_sha256=repeat('c',64);
    UPDATE private.production_marketing_controls SET events_enabled=true, dispatch_enabled=true, enrollment_enabled=true,
      daily_limit=20, monthly_limit=100, delivery_contract_text='${contract}', confirmation_worker_binding_hash='${binding.p_worker_binding_hash}' WHERE singleton;`);

  const mail: Array<{ body: Message; raw: string; key: string }> = [];
  const otherTraffic: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.url.startsWith(supabaseOriginForTarget("production") + "/rest/v1/rpc/"))
      return rpcFixture(request);
    // This provider owns no Contact for any test address and exposes only direct sending.
    if (
      request.url !== "https://api.resend.com/emails" ||
      request.method !== "POST" ||
      request.headers.get("authorization") !== "Bearer " + runtime.HELIX_PRODUCTION_MARKETING_PROVIDER_KEY ||
      request.redirect !== "error"
    ) {
      otherTraffic.push(request.method + " " + new URL(request.url).origin);
      throw new Error("Unexpected synthetic provider request.");
    }
    const raw = await request.text();
    mail.push({ body: JSON.parse(raw), raw, key: request.headers.get("idempotency-key") ?? "" });
    return Response.json({ id: randomUUID() });
  });

  const ready = () => status(new Request(origin + signup)).then((value) => value.json());
  expect(await ready()).toEqual({ production: true, enabled: true });

  // An ambiguous account callback can stop new enrollment before there is even a message to reconcile.
  const adminId = randomUUID();
  sql(`INSERT INTO public.admin_memberships(user_id,role,active) VALUES('${adminId}','admin',true);
       UPDATE private.production_marketing_controls SET status_enabled=true WHERE singleton;`);
  const operatorStatus = (actorId: string | null) => {
    currentUser.mockResolvedValue(actorId ? { id: actorId } : null);
    return readOperatorStatus(new Request(origin + "/api/internal/marketing/production/status"));
  };
  const noCustomersOrMessages = () =>
    sql(
      "SELECT NOT EXISTS(SELECT FROM private.production_marketing_subscribers) AND NOT EXISTS(SELECT FROM private.production_marketing_messages);",
    );
  expect(noCustomersOrMessages()).toBe("t");
  const ambiguous = signedContact("direct_unresolved", { email: visible, unsubscribed: "unknown" });
  expect(await (await callback(ambiguous)).json()).toEqual({ ok: true });
  expect(await ready()).toEqual({ production: true, enabled: false });
  expect((await enroll(visible)).status).toBe(503);
  expect(noCustomersOrMessages()).toBe("t");
  expect(mail.length).toBe(0);

  vi.stubEnv("HELIX_PRODUCTION_MARKETING_STATUS_ENABLED", "false");
  expect((await operatorStatus(adminId)).status).toBe(503);
  vi.stubEnv("HELIX_PRODUCTION_MARKETING_STATUS_ENABLED", "true");
  expect((await operatorStatus(null)).status).toBe(401);
  expect((await operatorStatus(randomUUID())).status).toBe(403);
  const report = await operatorStatus(adminId);
  expect(report.status).toBe(200);
  expect(report.headers.get("cache-control")).toBe("private, no-store");
  expect(await report.json()).toEqual({
    unresolvedPreferenceHolds: 1,
    uncertainMessages: 0,
    pendingSubscribers: 0,
    confirmedSubscribers: 0,
    withdrawnSubscribers: 0,
    suppressedSubscribers: 0,
    queuedMessages: 0,
    preparedMessages: 0,
    acceptedMessages: 0,
    deliveredMessages: 0,
    suppressedMessages: 0,
    failedMessages: 0,
  });

  // The owner records its inspection evidence for this exact, synthetic receipt.
  const resolution = digest("Synthetic operator inspected the ambiguous direct_unresolved callback.");
  expect(
    sql(`UPDATE private.production_marketing_direct_receipts
    SET resolved_at=clock_timestamp(), resolution_evidence_sha256='${resolution}'
    WHERE event_id='direct_unresolved' AND coverage_hold AND held AND resolved_at IS NULL RETURNING 1;`),
  ).toBe("1");
  expect((await (await operatorStatus(adminId)).json()).unresolvedPreferenceHolds).toBe(0);
  expect(await ready()).toEqual({ production: true, enabled: true });

  async function arrive(email: Customer, purpose: "confirmation" | "welcome") {
    const before = mail.length;
    expect(await tick()).toBe("accepted");
    expect(mail.length).toBe(before + 1);
    const { body, raw, key } = mail[before];
    expect(body.to).toEqual([email]);
    expect(body.from).toBe(sender);
    expect(body.reply_to).toBe(sender);
    expect(body.subject).toBe(
      purpose === "confirmation" ? "Confirm your Helix welcome emails" : "Welcome to Helix",
    );
    const id = body.tags.find((tag) => tag.name === "helix_message_id")?.value;
    expect(id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
    expect(body.tags).toEqual(
      expect.arrayContaining([
        { name: "helix_purpose", value: purpose },
        { name: "environment", value: "production" },
        { name: "helix_contract", value: "production_welcome_delivery_v1" },
      ]),
    );
    expect(key).toBe("production-marketing/" + id);
    expect(
      sql(`SELECT body_hash FROM private.production_marketing_messages WHERE id='${id}' AND state='accepted';`),
    ).toBe(digest(raw));
    expect(body.topic_id).toBe(purpose === "welcome" ? topic : undefined);
    return body;
  }

  for (const customer of [visible, mailbox]) {
    expect(state(customer)).toBe("");
    expect((await enroll(customer)).status).toBe(202);
    expect(state(customer)).toBe("pending");
    const invitation = await arrive(customer, "confirmation");
    expect(await tick()).toBe("idle");
    await customerClick(emailLink(invitation, "confirm"), "confirm");
    expect(state(customer)).toBe("confirmed");
    const welcome = await arrive(customer, "welcome");
    const preferences = emailLink(welcome, "preferences");
    const unsubscribe = new URL(welcome.headers["List-Unsubscribe"].slice(1, -1));
    expect(unsubscribe.origin).toBe(origin);
    expect(unsubscribe.pathname).toBe("/api/marketing/production/unsubscribe");
    expect(unsubscribe.searchParams.get("token") === preferences.hash.slice("#token=".length)).toBe(true);
    expect(welcome.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(await tick()).toBe("idle");
    if (customer === visible) {
      await customerClick(preferences, "preferences");
    } else {
      const response = await oneClick(
        new Request(unsubscribe.href, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "List-Unsubscribe=One-Click",
        }),
      );
      expect(response.status).toBe(200);
    }
    expect(state(customer)).toBe("withdrawn");
  }

  // Restrictive signed intake stays available while both admissions and dispatch are deliberately paused.
  sql(
    "UPDATE private.production_marketing_controls SET enrollment_enabled=false, dispatch_enabled=false WHERE singleton;",
  );
  vi.stubEnv("HELIX_PRODUCTION_MARKETING_ENABLED", "false");
  vi.stubEnv("HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED", "false");
  for (const [id, email] of [
    ["direct_unseen", previouslyDenied],
    ["direct_existing", mailbox],
  ] as const) {
    for (let attempt = 0; attempt < 2; attempt++)
      expect((await callback(signedContact(id, { email, unsubscribed: true }))).status).toBe(200);
  }
  // On resume, a pre-signup denial survives its replay. No signup can silently reinstate permission.
  sql(
    "UPDATE private.production_marketing_controls SET enrollment_enabled=true, dispatch_enabled=true WHERE singleton;",
  );
  vi.stubEnv("HELIX_PRODUCTION_MARKETING_ENABLED", "true");
  vi.stubEnv("HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED", "true");
  expect(await ready()).toEqual({ production: true, enabled: true });
  for (const email of [previouslyDenied, mailbox]) {
    expect((await enroll(email)).status).toBe(202);
    expect(await tick()).toBe("idle");
  }
  expect(state(previouslyDenied)).toBe("");
  expect(state(mailbox)).toBe("withdrawn");
  expect(sql("SELECT count(*) FROM private.production_marketing_direct_denials WHERE scope='global';")).toBe("2");
  expect(sql("SELECT count(*) FROM private.production_marketing_messages;")).toBe("4");
  expect(mail.length).toBe(4);
  expect(otherTraffic).toEqual([]);
}, 60000);
