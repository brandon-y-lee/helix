import { createHash, createHmac, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { GET as status, POST as subscribe } from "@/app/api/marketing/production/subscription/route";
import { POST as confirm } from "@/app/api/marketing/production/confirm/route";
import { POST as dispatch } from "@/app/api/internal/marketing/production/dispatch/route";
import { POST as callback } from "@/app/api/webhooks/marketing-production/route";
import { productionSignupQualification } from "@/lib/production-marketing/storage";
import { nativeWelcomeTemplate, productionMarketingTemplateHash } from "@/lib/production-marketing/template-content";
import { HELIX_VERCEL_PROJECT_ID, supabaseOriginForTarget } from "@/lib/supabase/project-safety";
import { handleWake } from "../../workers/production-welcome/publisher.mjs";
import { journeyServiceKey, rpcFixture, sql, withJourneyDatabase } from "./native-welcome-journey-pg";

const origin = "https://www.helixskin.us";
const address = "first-person-journey@example.invalid";
const nativeSender = "welcome@updates.helixskin.us";
const topic = "00000000-0000-4000-8000-000000000598";
const templateId = "d353756a-2b37-44d2-88b3-32a777d80276";
const contractHash = "c".repeat(64);
const signing = Buffer.from("locally generated journey signing secret");
const anon = "sb_publishable_journey_synthetic";
const rawContract = JSON.stringify({
  version: "production_welcome_delivery_v1", from: "news@helixskin.us", replyTo: "support@helixskin.us",
  topicId: topic, postalAddress: "Synthetic confirmation address", templateHash: productionMarketingTemplateHash,
});
const storefront = {
  VERCEL: "1", VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production", VERCEL_GIT_COMMIT_REF: "main",
  VERCEL_GIT_COMMIT_SHA: "a".repeat(40), VERCEL_PROJECT_ID: HELIX_VERCEL_PROJECT_ID,
  VERCEL_DEPLOYMENT_ID: "dpl_SyntheticJourney", VERCEL_PROJECT_PRODUCTION_URL: "www.helixskin.us",
  NEXT_PUBLIC_SUPABASE_URL: supabaseOriginForTarget("production"), NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
  HELIX_PRODUCTION_SUPABASE_ANON_KEY_SHA256: createHash("sha256").update(anon).digest("hex"),
  HELIX_PRODUCTION_MARKETING_SITE_ORIGIN: origin, HELIX_PRODUCTION_MARKETING_ENABLED: "true",
  HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID: HELIX_VERCEL_PROJECT_ID,
  HELIX_PRODUCTION_MARKETING_SUPABASE_URL: supabaseOriginForTarget("production"),
  HELIX_PRODUCTION_MARKETING_SERVICE_KEY: journeyServiceKey, HELIX_PRODUCTION_MARKETING_ABUSE_KEY: "1".repeat(64),
  HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY: "2".repeat(64), HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID: "journey",
  HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED: "true", HELIX_PRODUCTION_MARKETING_WORKER_TOKEN: "raw-worker-".repeat(5),
  HELIX_PRODUCTION_MARKETING_PROVIDER_KEY: "re_synthetic_confirmation_only", HELIX_PRODUCTION_MARKETING_DELIVERY_CONTRACT: rawContract,
  HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET: "whsec_" + signing.toString("base64"), HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED: "true",
  HELIX_PRODUCTION_MARKETING_NATIVE_CONTRACT_SHA256: contractHash, HELIX_PRODUCTION_MARKETING_NATIVE_SENDER: nativeSender,
  HELIX_PRODUCTION_MARKETING_NATIVE_TEMPLATE_ID: templateId,
};
const publisher = {
  VERCEL: "1", VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production", VERCEL_GIT_PROVIDER: "github",
  VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_COMMIT_SHA: "d".repeat(40), VERCEL_GIT_REPO_ID: "123456",
  VERCEL_PROJECT_ID: "prj_native598", VERCEL_DEPLOYMENT_ID: "dpl_native598", VERCEL_URL: "publisher-build.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "publisher.vercel.app", HELIX_NATIVE_WELCOME_ORIGIN: "https://publisher.vercel.app",
  HELIX_NATIVE_WELCOME_PROJECT_ID: "prj_native598", HELIX_NATIVE_WELCOME_GIT_REPO_ID: "123456",
  HELIX_NATIVE_WELCOME_CONTRACT_SHA256: contractHash, HELIX_NATIVE_WELCOME_ENABLED: "true",
  HELIX_NATIVE_WELCOME_WAKE_TOKEN: "local-wake-".repeat(5), HELIX_NATIVE_WELCOME_DB_PASSWORD: "synthetic-publisher-db",
  HELIX_NATIVE_WELCOME_RESEND_KEY: "re_synthetic_native_events_only",
};
const signupPath = "/api/marketing/production/subscription";
const emailPredicate = "s.normalized_email='first-person-journey@example.invalid'";
const human = (path: string, body: object) => new Request(origin + path, {
  method: "POST", headers: { origin, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.15" },
  body: JSON.stringify(body),
});
const rawWake = () => dispatch(new Request(origin + "/api/internal/marketing/production/dispatch", {
  method: "POST", headers: { authorization: "Bearer " + storefront.HELIX_PRODUCTION_MARKETING_WORKER_TOKEN },
}));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("takes one new customer from qualified signup to a native welcome and durable provider withdrawal", async () => {
  for (const [key, value] of Object.entries(storefront)) vi.stubEnv(key, value);
  const binding = productionSignupQualification(storefront);
  // Retire the cloned historical fixtures via their withdrawal capability. Never consume a
  // test email or quota slot on behalf of a different synthetic contact during this journey.
  sql(`SELECT public.withdraw_production_marketing_subscription(g.preference_hash)
    FROM private.production_marketing_generations g JOIN private.production_marketing_subscribers s ON s.id=g.subscriber_id
    WHERE s.normalized_email IN ('old-confirmed@example.invalid','old-pending@example.invalid','leased-before-package@example.invalid');`);
  expect(sql("SELECT count(*) FROM private.production_marketing_subscribers s WHERE " + emailPredicate)).toBe("0");
  expect(sql(`SELECT EXISTS(SELECT FROM private.production_marketing_native_epochs WHERE contract_hash=repeat('c',64)
    AND sender='welcome@updates.helixskin.us' AND topic_id='00000000-0000-4000-8000-000000000598');`)).toBe("t");

  // Bind this disposable deployment to the real worker, callback and published template contract.
  sql(`UPDATE private.production_marketing_controls SET delivery_contract_text='${rawContract}',
    confirmation_worker_binding_hash='${binding.p_worker_binding_hash}' WHERE singleton;
    UPDATE private.production_marketing_native_policy SET confirmation_contract_hash='${binding.p_contract_hash}',
    confirmation_worker_binding_hash='${binding.p_worker_binding_hash}' WHERE singleton;`);

  const inbox: { subject: string; text: string }[] = [];
  const hostedPreferences = "https://preferences.example.invalid/journey";
  const welcome = nativeWelcomeTemplate().content;
  let eventAttempts = 0;
  const simulatedTransport = vi.fn<typeof fetch>(async (url, options) => {
    if (String(url) === "https://api.resend.com/emails") {
      expect(options?.method).toBe("POST");
      expect(options?.redirect).toBe("error");
      expect(new Headers(options?.headers).get("authorization")).toBe("Bearer " + storefront.HELIX_PRODUCTION_MARKETING_PROVIDER_KEY);
      const body = JSON.parse(String(options?.body));
      expect(body.to).toEqual([address]);
      expect(body.tags).toContainEqual({ name: "helix_purpose", value: "confirmation" });
      expect(body.subject).toBe("Confirm your Helix welcome emails");
      inbox.push({ subject: body.subject, text: body.text });
      return Response.json({ id: randomUUID() });
    }
    if (String(url) === "https://api.resend.com/events/send") {
      expect(options?.method).toBe("POST");
      expect(options?.redirect).toBe("error");
      expect(new Headers(options?.headers).get("authorization")).toBe("Bearer " + publisher.HELIX_NATIVE_WELCOME_RESEND_KEY);
      const body = JSON.parse(String(options?.body));
      expect(body).toEqual({ event: "helix.welcome.confirmed.v1", email: address,
        payload: { attempt_id: expect.stringMatching(/^[0-9a-f-]{36}$/) } });
      expect(sql(`SELECT native_attempt_id FROM private.production_marketing_messages m JOIN private.production_marketing_subscribers s
        ON m.subscriber_id=s.id WHERE ${emailPredicate} AND m.state='native_reserved';`)).toBe(body.payload.attempt_id);
      eventAttempts++;
      // One simulated Automation with a default opted-in Topic issues the reviewed welcome.
      // This synthetic inbox lets the customer follow its provider-owned preference link.
      expect(welcome.text).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
      inbox.push({ subject: welcome.subject, text: welcome.text.replace("{{{RESEND_UNSUBSCRIBE_URL}}}", hostedPreferences) });
      return Response.json({ object: "event", event: body.event }, { status: 202 });
    }
    return rpcFixture(url, options);
  });
  vi.stubGlobal("fetch", simulatedTransport);
  const nativeWake = () => handleWake(new Request(publisher.HELIX_NATIVE_WELCOME_ORIGIN + "/api/wake", {
    method: "POST", headers: { authorization: "Bearer " + publisher.HELIX_NATIVE_WELCOME_WAKE_TOKEN },
  }), publisher, { withDatabase: withJourneyDatabase, fetchImpl: simulatedTransport });
  const reenter = () => subscribe(human(signupPath, { email: address, consent: true }));
  expect(await (await status(new Request(origin + signupPath))).json()).toEqual({ production: true, enabled: true });
  expect((await reenter()).status).toBe(202);
  expect(sql("SELECT state FROM private.production_marketing_subscribers s WHERE " + emailPredicate)).toBe("pending");
  expect(await (await nativeWake()).json()).toEqual({ status: "idle" });
  expect(await (await rawWake()).json()).toEqual({ status: "accepted" });
  expect(inbox.map(message => message.subject)).toEqual(["Confirm your Helix welcome emails"]);
  const token = /https:\/\/www\.helixskin\.us\/marketing\/production\/confirm#token=([A-Za-z0-9_-]{43})\b/.exec(inbox[0].text)?.[1];
  expect(Boolean(token)).toBe(true);
  expect((await confirm(human("/api/marketing/production/confirm", { token }))).status).toBe(200);
  expect(await (await rawWake()).json()).toEqual({ status: "idle" });
  expect(await (await nativeWake()).json()).toEqual({ status: "submitted" });
  expect(inbox.map(message => message.subject)).toEqual(["Confirm your Helix welcome emails", "Welcome to Helix"]);
  expect(inbox[1].text).toContain(hostedPreferences);
  expect(sql(`SELECT m.state FROM private.production_marketing_messages m JOIN private.production_marketing_subscribers s
    ON m.subscriber_id=s.id WHERE ${emailPredicate} AND m.purpose='welcome';`)).toBe("native_submitted");

  // The callback remains usable while the operator has paused dispatch and enrollment.
  sql("UPDATE private.production_marketing_controls SET dispatch_enabled=false,native_welcome_enabled=false WHERE singleton; UPDATE private.production_marketing_controls SET enrollment_enabled=false WHERE singleton;");
  const id = "msg_journey_topic_withdrawal", stamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: "contact.topics.updated", created_at: new Date().toISOString(),
    data: { email: address, topics: [{ id: topic, subscription: "opt_out" }] } });
  const signature = createHmac("sha256", signing).update([id, stamp, body].join(".")).digest("base64");
  const signedWithdrawal = () => new Request(origin + "/api/webhooks/marketing-production", {
    method: "POST", body, headers: { "svix-id": id, "svix-timestamp": stamp, "svix-signature": "v1," + signature },
  });
  expect((await callback(signedWithdrawal())).status).toBe(200);
  expect((await callback(signedWithdrawal())).status).toBe(200);
  expect(sql(`SELECT r.outcome FROM private.production_marketing_native_receipts r JOIN private.production_marketing_subscribers s
    ON s.id=r.restricted_subscriber_id WHERE ${emailPredicate} AND r.event_id='msg_journey_topic_withdrawal' AND s.state='withdrawn';`)).toBe("applied");

  sql("UPDATE private.production_marketing_controls SET dispatch_enabled=true,native_welcome_enabled=true,enrollment_enabled=true WHERE singleton;");
  expect(await (await status(new Request(origin + signupPath))).json()).toEqual({ production: true, enabled: true });
  expect((await reenter()).status).toBe(202);
  expect(sql("SELECT generation FROM private.production_marketing_subscribers s WHERE " + emailPredicate)).toBe("1");
  expect(await (await rawWake()).json()).toEqual({ status: "idle" });
  expect(await (await nativeWake()).json()).toEqual({ status: "idle" });
  expect(eventAttempts).toBe(1);
  expect(inbox).toHaveLength(2);
}, 30000);
