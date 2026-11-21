// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { nativeWelcomeTemplate, productionMarketingTemplateHash } from "@/lib/production-marketing/template-content";
import { nativeWelcomeContract, qualifyNativeWelcome } from "../scripts/qualify-native-welcome.mjs";

const observedAt = "2026-11-21T09:00:00.000Z";
const qualifiedUntil = "2026-11-21T12:00:00.000Z";
const now = Date.parse("2026-11-21T10:00:00.000Z");
const topicId = "10000000-0000-4000-a000-000000000001";
const templateId = "10000000-0000-4000-a000-000000000002";
const automationId = "10000000-0000-4000-a000-000000000003";
const sender = "welcome-test@helixskin.us";
const replyTo = "support@helixskin.us";
const postalAddress = "Helix Labs LLC, 2747 Haste Street, Berkeley, CA 94704";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Sanitized packet shape. Every evidence digest here is synthetic and the clock is fixed.
function packet() {
  const p = {
    version: 1, observedAt, qualifiedUntil,
    evidence: {
      effectiveAutomationInventory: "a".repeat(64), approvedSenderReplyAndPostal: "b".repeat(64),
      independentSenderExclusivity: "c".repeat(64), publisherSourceAndCredentialCustody: "d".repeat(64),
      deployedIdentitiesAndScopedRole: "e".repeat(64), confirmationWorkerCadenceAndBinding: "f".repeat(64),
      accountWideRoutingAndSupportContinuity: "1".repeat(64), sharedCapacityAndOverage: "2".repeat(64),
      cleanupCadence: "3".repeat(64), crashAlertAndNoReplay: "4".repeat(64), rollbackAndWithdrawal: "5".repeat(64),
    },
    activeEventAutomations: [{ id: automationId, status: "enabled", steps: [
      { type: "trigger", event: "helix.welcome.confirmed.v1" },
      { type: "send_email", templateId, topicId, sender, replyTo },
    ] }],
    template: { id: templateId, status: "published", ...nativeWelcomeTemplate().content },
    topic: { id: topicId, name: "Helix Marketing Updates", visibility: "private", defaultSubscription: "opt_in" },
    approvedMail: { sender, replyTo, postalAddress, senderExclusive: true, replyMonitored: true },
    target: { parent: "erasogmsqpgiirovubjh", role: "helix_native_welcome_worker",
      storefrontOrigin: "https://www.helixskin.us", storefrontProject: "prj_N9nyPL9SixJHOROIovS8PDQ9aKny",
      storefrontDeployment: "dpl_storefront", storefrontSha: "1".repeat(40),
      publisherRepository: "1234567", publisherProject: "prj_publisher", publisherDeployment: "dpl_worker",
      publisherSha: "2".repeat(40), publisherEnvironment: "production", publisherBranch: "main",
      publisherContractHash: "", receiverContractHash: "", receiverSender: sender, receiverTemplateId: templateId },
    confirmation: { deliveryContractText: JSON.stringify({ version: "production_welcome_delivery_v1",
      from: "confirm-test@helixskin.us", replyTo, topicId, postalAddress, templateHash: productionMarketingTemplateHash }, null, 1),
      workerBindingSha256: "6".repeat(64) },
    quota: { dayUtc: "2026-11-21", monthUtc: "2026-11", allocation: "snapshot",
      billingPeriodStart: "2026-11-01T00:00:00Z", billingPeriodEnd: "2026-12-01T00:00:00Z", overageEnabled: false, dailyLimit: 4, monthlyLimit: 12,
      dailyEmail: { limit: 20, used: 10, other: 1, transactional: 3, inbound: 2 },
      monthlyEmail: { limit: 100, used: 50, other: 8, transactional: 20, inbound: 10 },
      contacts: { limit: 30, used: 24, other: 2 }, automationRuns: { limit: 20, used: 14, other: 2 } },
  };
  const { version, activeEventAutomations, template, topic, approvedMail } = p;
  const source = nativeWelcomeContract({ version, activeEventAutomations, template, topic, approvedMail });
  if (!("contract_hash" in source)) throw new Error("Invalid provider fixture");
  p.target.publisherContractHash = source.contract_hash;
  p.target.receiverContractHash = source.contract_hash;
  return p;
}

it("qualifies measured template bytes, preserves the exact P4 confirmation bytes and emits only owner policy inputs", () => {
  const p = packet();
  const qualified = qualifyNativeWelcome(p, now);
  expect(qualified).toMatchObject({
    status: "qualified", epoch: { sender, topic_id: topicId },
    policy: { confirmation_contract_hash: sha256(p.confirmation.deliveryContractText),
      confirmation_worker_binding_hash: p.confirmation.workerBindingSha256, observed_at: observedAt,
      qualified_until: qualifiedUntil, daily_limit: 4, monthly_limit: 12, sender_exclusive: true, quota_qualified: true },
  });
  if (!("epoch" in qualified)) throw new Error("Expected qualified packet");
  expect(qualified.policy.contract_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(qualified.epoch.contract_hash).toBe(qualified.policy.contract_hash);
  expect(JSON.stringify(qualified)).not.toMatch(/Helix Labs|<html|dpl_storefront|enrollment_enabled|native_welcome_enabled/);
  const { version, activeEventAutomations, template, topic, approvedMail } = p;
  const source = { version, activeEventAutomations, template, topic, approvedMail };
  expect(nativeWelcomeContract(source)).toEqual({ status: "contract", contract_hash: qualified.epoch.contract_hash });
  activeEventAutomations[0].id = templateId;
  expect(nativeWelcomeContract(source)).not.toEqual({ status: "contract", contract_hash: qualified.epoch.contract_hash });
  activeEventAutomations[0].id = automationId;
  p.target.publisherDeployment = "dpl_another";
  p.observedAt = "2026-11-21T09:15:00.000Z";
  const changed = qualifyNativeWelcome(p, now);
  if (!("epoch" in changed)) throw new Error("Expected qualified replacement deployment");
  expect(changed.epoch).toEqual(qualified.epoch);
  expect(changed.policy.evidence_sha256).not.toBe(qualified.policy.evidence_sha256);
  expect(changed.policy.qualified_until).toBe(qualifiedUntil);
  expect(changed.policy.publisher_deployment_id).toBe("dpl_another");
});

type Packet = ReturnType<typeof packet>;
it.each<[string, (p: Packet) => void]>([
  ["duplicate active Automation", p => { p.activeEventAutomations.push(p.activeEventAutomations[0]); }],
  ["additional send", p => { p.activeEventAutomations[0].steps.push(p.activeEventAutomations[0].steps[1]); }],
  ["filtered trigger", p => { Object.assign(p.activeEventAutomations[0].steps[0], { filter: true }); }],
  ["alternate event", p => { p.activeEventAutomations[0].steps[0].event = "another"; }],
  ["unpublished content", p => { p.template.status = "draft"; }],
  ["published template edit", p => { p.template.text += " "; }],
  ["wrong effective Topic", p => { p.activeEventAutomations[0].steps[1].topicId = templateId; }],
  ["first-time Contact default", p => { p.topic.defaultSubscription = "opt_out"; }],
  ["shared sender", p => { p.approvedMail.senderExclusive = false; }],
  ["existing support sender", p => { p.approvedMail.sender = "contact@helixskin.us";
    p.activeEventAutomations[0].steps[1].sender = p.approvedMail.sender; }],
  ["missing exclusivity proof", p => { p.evidence.independentSenderExclusivity = ""; }],
  ["publisher configuration drift", p => { p.target.publisherContractHash = "0".repeat(64); }],
  ["receiver configuration drift", p => { p.target.receiverTemplateId = automationId; }],
  ["storefront source custody", p => { p.target.publisherRepository = "1280166759"; }],
  ["storefront project", p => { p.target.publisherProject = p.target.storefrontProject; }],
  ["child database", p => { p.target.parent = "zyfkunnpnlmgvrojmrbg"; }],
  ["expired daily observations", p => { p.qualifiedUntil = "2026-11-22T12:00:00.000Z"; }],
  ["beyond actual billing period", p => { p.quota.billingPeriodEnd = p.observedAt; }],
  ["unverified rollback", p => { p.evidence.rollbackAndWithdrawal = ""; }],
  ["overage", p => { p.quota.overageEnabled = true; }],
  ["Contact capacity", p => { p.quota.contacts.used++; }],
  ["run capacity", p => { p.quota.automationRuns.used++; }],
  ["shared email headroom", p => { p.quota.monthlyEmail.inbound++; }],
  ["unreserved inbound traffic", p => { p.quota.dailyEmail.inbound = 0; }],
  ["incorrect legacy template hash", p => { p.confirmation.deliveryContractText =
    p.confirmation.deliveryContractText.replace(productionMarketingTemplateHash, "7".repeat(64)); }],
  ["unknown field in sanitized scope", p => { Object.assign(p.target, { extra: "sensitive-fixture" }); }],
])("pauses without disclosing operator inputs for %s", (_name, change) => {
  const p = packet();
  change(p);
  expect(qualifyNativeWelcome(p, now)).toEqual({ status: "paused", gate: expect.any(String) });
});

it("fails closed on missing, stale and future observations", () => {
  for (const value of [null, {}, []]) expect(qualifyNativeWelcome(value, now).status).toBe("paused");
  for (const time of [Date.parse(observedAt) - 1, Date.parse(qualifiedUntil)])
    expect(qualifyNativeWelcome(packet(), time).status).toBe("paused");
});

it("can retain a verified allocation until billing resets if every possible new contact and run fits", () => {
  const p = packet();
  p.quota.allocation = "retained";
  p.qualifiedUntil = p.quota.billingPeriodEnd;
  p.quota.contacts.limit += 8;
  p.quota.automationRuns.limit += 8;
  expect(qualifyNativeWelcome(p, now).status).toBe("qualified");
  p.quota.automationRuns.limit--;
  expect(qualifyNativeWelcome(p, now)).toEqual({ status: "paused", gate: "quota" });
});
