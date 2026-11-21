// Offline only. Feed one sanitized, independently inspected packet through stdin.
// --contract accepts just version, activeEventAutomations, template, topic and
// approvedMail. Pin the same result for the staged disabled and enabled Automation. With no
// arguments, qualify the full deployed tuple and current allocation.
// The synthetic Vitest packet documents its shape. Evidence fields are SHA-256
// references to controlled operator records with verifier, target and check time.
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { nativeWelcomeTemplate, productionMarketingTemplateHash } from "../lib/production-marketing/template-content.ts";
import { validRecipient } from "../workers/production-welcome/bindings.mjs";

const digest = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const matches = (value, pattern) => typeof value === "string" && pattern.test(value);
const uuid = (value) => matches(value, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
const sha256 = (value) => matches(value, /^[0-9a-f]{64}$/);
const sourceSha = (value) => matches(value, /^[0-9a-f]{40}$/);
const project = (value) => matches(value, /^prj_[A-Za-z0-9]{1,64}$/);
const deployment = (value) => matches(value, /^dpl_[A-Za-z0-9]{1,64}$/);
const helixMail = (value) => validRecipient(value) && /@(?:[a-z0-9-]+\.)*helixskin\.us$/.test(value);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, fields) => record(value) && Object.keys(value).length === fields.length &&
  fields.every(field => Object.hasOwn(value, field));
const nonnegative = (n) => Number.isSafeInteger(n) && n >= 0;
const paused = (gate) => ({ status: "paused", gate });

const attestations = [
  "effectiveAutomationInventory", "approvedSenderReplyAndPostal", "independentSenderExclusivity",
  "publisherSourceAndCredentialCustody", "deployedIdentitiesAndScopedRole", "confirmationWorkerCadenceAndBinding",
  "accountWideRoutingAndSupportContinuity", "sharedCapacityAndOverage", "cleanupCadence",
  "crashAlertAndNoReplay", "rollbackAndWithdrawal",
];

// JSON object order is immaterial, except inside deliveryContractText. The P4
// worker and SQL hash that field verbatim, including whitespace and key order.
function canonical(value) {
  return JSON.stringify(value, (_key, v) => record(v)
    ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
}

function timestamp(value) {
  if (!matches(value, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/)) return NaN;
  const time = Date.parse(value);
  const expected = value.includes(".") ? value : value.slice(0, -1) + ".000Z";
  return Number.isFinite(time) && new Date(time).toISOString() === expected ? time : NaN;
}

const providerFields = ["version", "activeEventAutomations", "template", "topic", "approvedMail"];

function validatedContract({ activeEventAutomations: inventory, template, topic, approvedMail: approved }) {
  if (!Array.isArray(inventory) || inventory.length !== 1) return null;
  const automation = inventory[0];
  if (!exact(automation, ["id", "status", "steps"]) || !uuid(automation.id) || !["enabled", "disabled"].includes(automation.status) ||
      !Array.isArray(automation.steps) || automation.steps.length !== 2) return null;
  const [trigger, send] = automation.steps;
  if (!exact(trigger, ["type", "event"]) || trigger.type !== "trigger" || trigger.event !== "helix.welcome.confirmed.v1" ||
      !exact(send, ["type", "templateId", "topicId", "sender", "replyTo"]) || send.type !== "send_email") return null;
  if (!exact(template, ["id", "status", "subject", "html", "text"]) || !uuid(template.id) ||
      template.status !== "published" || send.templateId !== template.id) return null;
  if (!exact(topic, ["id", "name", "visibility", "defaultSubscription"]) || !uuid(topic.id) || send.topicId !== topic.id ||
      topic.name !== "Helix Marketing Updates" || topic.visibility !== "private" || topic.defaultSubscription !== "opt_in") return null;
  if (!exact(approved, ["sender", "replyTo", "postalAddress", "senderExclusive", "replyMonitored"]) ||
      approved.senderExclusive !== true || approved.replyMonitored !== true || !helixMail(send.sender) || !helixMail(send.replyTo) ||
      ["contact@helixskin.us", "support@helixskin.us", send.replyTo].includes(send.sender) ||
      send.sender !== approved.sender || send.replyTo !== approved.replyTo ||
      !matches(send.sender, /^[a-z0-9][a-z0-9._+-]*@/) ||
      typeof approved.postalAddress !== "string" || !approved.postalAddress || /[\r\n]/.test(approved.postalAddress)) return null;
  const { subject, html, text } = template;
  const reviewed = nativeWelcomeTemplate();
  if (![subject, html, text].every(v => typeof v === "string") ||
      digest(JSON.stringify({ subject, html, text })) !== reviewed.contentSha256 ||
      !reviewed.content.text.endsWith("\nHelix\n" + approved.postalAddress)) return null;
  return digest(canonical({
    version: "helix:production-marketing:native-welcome:v1", automation: { id: automation.id, steps: automation.steps },
    template: { id: template.id, contentSha256: reviewed.contentSha256 },
    topic, sender: approved.sender, replyTo: approved.replyTo, postalAddress: approved.postalAddress,
  }));
}

export function nativeWelcomeContract(input) {
  if (!exact(input, providerFields) || input.version !== 1) return paused("packet");
  const contractHash = validatedContract(input);
  return contractHash ? { status: "contract", contract_hash: contractHash } : paused("automation");
}

function qualifiedTarget(target, contractHash, approvedMail, template) {
  return exact(target, ["parent", "role", "storefrontOrigin", "storefrontProject", "storefrontDeployment", "storefrontSha",
    "publisherRepository", "publisherProject", "publisherDeployment", "publisherSha", "publisherEnvironment", "publisherBranch",
    "publisherContractHash", "receiverContractHash", "receiverSender", "receiverTemplateId"]) &&
    target.publisherContractHash === contractHash && target.receiverContractHash === contractHash &&
    target.receiverSender === approvedMail.sender && target.receiverTemplateId === template.id &&
    target.parent === "erasogmsqpgiirovubjh" && target.role === "helix_native_welcome_worker" &&
    target.storefrontOrigin === "https://www.helixskin.us" && target.storefrontProject === "prj_N9nyPL9SixJHOROIovS8PDQ9aKny" &&
    deployment(target.storefrontDeployment) && sourceSha(target.storefrontSha) &&
    matches(target.publisherRepository, /^[1-9][0-9]{0,19}$/) && target.publisherRepository !== "1280166759" &&
    project(target.publisherProject) && target.publisherProject !== target.storefrontProject &&
    deployment(target.publisherDeployment) && target.publisherDeployment !== target.storefrontDeployment && sourceSha(target.publisherSha) &&
    target.publisherEnvironment === "production" && target.publisherBranch === "main";
}

function confirmationDigest(confirmation, reservedSender) {
  if (!exact(confirmation, ["deliveryContractText", "workerBindingSha256"]) || !sha256(confirmation.workerBindingSha256) ||
      typeof confirmation.deliveryContractText !== "string" || confirmation.deliveryContractText.length > 4096) return null;
  let c;
  try { c = JSON.parse(confirmation.deliveryContractText); } catch { return null; }
  if (!exact(c, ["version", "from", "replyTo", "topicId", "postalAddress", "templateHash"]) ||
      c.version !== "production_welcome_delivery_v1" || !helixMail(c.from) || c.from === reservedSender ||
      !matches(c.replyTo, /^[^\s<>@]+@(?:[a-z0-9-]+\.)*helixskin\.us$/) || !uuid(c.topicId) || typeof c.postalAddress !== "string" || !c.postalAddress ||
      c.postalAddress !== c.postalAddress.trim() || c.postalAddress.length > 500 || /[\r\n\x00]/.test(c.postalAddress) ||
      c.templateHash !== productionMarketingTemplateHash) return null;
  return digest(confirmation.deliveryContractText);
}

function capacity(pool, allocation, sharedEmail) {
  const fields = sharedEmail ? ["limit", "used", "other", "transactional", "inbound"] : ["limit", "used", "other"];
  if (!exact(pool, fields) || !fields.every(k => nonnegative(pool[k]))) return false;
  const available = pool.limit - pool.used - pool.other;
  if (!sharedEmail) return available >= allocation;
  return pool.transactional > 0 && pool.inbound > 0 && available - pool.transactional - pool.inbound >= allocation;
}

const dayMs = 86400000;

function qualifiedQuota(q, observedAt, observed, until) {
  if (!exact(q, ["dayUtc", "monthUtc", "allocation", "billingPeriodStart", "billingPeriodEnd", "overageEnabled", "dailyLimit", "monthlyLimit",
    "dailyEmail", "monthlyEmail", "contacts", "automationRuns"])) return false;
  const { dailyLimit, monthlyLimit } = q;
  if (q.dayUtc !== observedAt.slice(0, 10) || q.monthUtc !== observedAt.slice(0, 7) || q.overageEnabled !== false ||
      !nonnegative(dailyLimit) || dailyLimit < 1 || dailyLimit > 100000 ||
      !nonnegative(monthlyLimit) || monthlyLimit < 1 || monthlyLimit > 1000000) return false;
  // The earliest checked provider billing boundary and the UTC monthly ledger
  // bound this allocation. Snapshot-only evidence also expires at midnight.
  const billingStart = timestamp(q.billingPeriodStart), billingEnd = timestamp(q.billingPeriodEnd);
  const dayStart = Math.floor(observed / dayMs) * dayMs;
  const nextMonth = new Date(dayStart);
  nextMonth.setUTCDate(1);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  if (!(billingStart <= observed && until <= billingEnd && until <= nextMonth.getTime()) ||
      (q.allocation !== "retained" && !(q.allocation === "snapshot" && until <= dayStart + dayMs))) return false;

  // A retained allocation coordinates these daily/monthly reserves with every
  // other producer across the full window. Plan for every welcome to introduce
  // a Contact, including one complete daily allowance on each partial UTC day.
  const days = Math.ceil((until - dayStart) / dayMs);
  const possibleWelcomes = Math.min(days * dailyLimit, monthlyLimit);
  return capacity(q.dailyEmail, dailyLimit, true) && capacity(q.monthlyEmail, monthlyLimit, true) &&
    capacity(q.contacts, possibleWelcomes, false) && capacity(q.automationRuns, possibleWelcomes, false);
}

export function qualifyNativeWelcome(packet, now = Date.now()) {
  if (!exact(packet, [...providerFields, "observedAt", "qualifiedUntil", "evidence", "target", "confirmation", "quota"]) || packet.version !== 1) return paused("packet");
  const observed = timestamp(packet.observedAt), until = timestamp(packet.qualifiedUntil);
  if (!(observed <= now && now < until)) return paused("freshness");
  if (!exact(packet.evidence, attestations) || !attestations.every(k => sha256(packet.evidence[k]))) return paused("evidence");
  const contractHash = validatedContract(packet);
  if (!contractHash || packet.activeEventAutomations[0].status !== "enabled") return paused("automation");
  if (!qualifiedTarget(packet.target, contractHash, packet.approvedMail, packet.template)) return paused("target");
  const confirmationHash = confirmationDigest(packet.confirmation, packet.approvedMail.sender);
  if (!confirmationHash) return paused("confirmation");
  if (!qualifiedQuota(packet.quota, packet.observedAt, observed, until)) return paused("quota");

  const evidenceHash = digest(canonical(packet));
  return {
    status: "qualified",
    epoch: { contract_hash: contractHash, sender: packet.approvedMail.sender, topic_id: packet.topic.id },
    policy: {
      contract_hash: contractHash, evidence_sha256: evidenceHash, observed_at: packet.observedAt, qualified_until: packet.qualifiedUntil,
      confirmation_contract_hash: confirmationHash, confirmation_worker_binding_hash: packet.confirmation.workerBindingSha256,
      publisher_project_id: packet.target.publisherProject, publisher_deployment_id: packet.target.publisherDeployment,
      publisher_git_sha: packet.target.publisherSha, daily_limit: packet.quota.dailyLimit, monthly_limit: packet.quota.monthlyLimit,
      provider_qualified: true, routing_qualified: true, quota_qualified: true, sender_exclusive: true,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result = paused("packet");
  try {
    const sourceOnly = process.argv.length === 3 && process.argv[2] === "--contract";
    if (!process.stdin.isTTY && (sourceOnly || process.argv.length === 2)) {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of process.stdin) {
        bytes += chunk.length;
        if (bytes > 65536) break;
        chunks.push(chunk);
      }
      if (bytes <= 65536) {
        const packet = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        result = sourceOnly ? nativeWelcomeContract(packet) : qualifyNativeWelcome(packet);
      }
    }
  } catch { /* A malformed packet fails closed without printing its contents. */ }
  process.stdout.write(JSON.stringify(result) + "\n");
  if (result.status === "paused") process.exitCode = 1;
}
