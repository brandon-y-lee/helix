import { APPROVED_SUPABASE_PROJECT_REF } from "../../lib/supabase/project-safety";
import { STRIPE_API_VERSION } from "../../lib/checkout/config";
import { APPROVED_STRIPE_SANDBOX_ACCOUNT_ID, HELIX_STRIPE_WEBHOOK_EVENTS, HELIX_STRIPE_WEBHOOK_URL } from "../stripe/sandbox-webhook";

import {
  PAYMENT_SCHEDULER_BASE_INVENTORY_SQL,
  PAYMENT_SCHEDULER_INSTALLED_INVENTORY_SQL,
  parseSchedulerBaseInventory,
  parseSchedulerInstalledInventory,
  type SchedulerBaseInventory,
  type SchedulerInstalledInventory,
} from "./scheduler-inventory";

export const PAYMENT_SCHEDULER = Object.freeze({
  projectRef: APPROVED_SUPABASE_PROJECT_REF,
  accountId: APPROVED_STRIPE_SANDBOX_ACCOUNT_ID,
  environment: "sandbox" as const,
  apiVersion: STRIPE_API_VERSION,
  endpointId: "we_1U6GHJFEzyaKzdmqVxkG9jRC",
  webhookUrl: HELIX_STRIPE_WEBHOOK_URL,
  events: [...HELIX_STRIPE_WEBHOOK_EVENTS],
  url: "https://helixskin.vercel.app/api/internal/payments/reconcile",
  jobName: "helix-sandbox-payment-reconciliation",
  wrapper: "private.wake_sandbox_payment_worker()",
  vaultReference: "helix_sandbox_payment_worker_secret",
  serverSecretName: "PAYMENT_WORKER_SECRET",
  cadence: "* * * * *",
  timeoutMs: 50_000,
  workBudgetMs: 40_000,
  routeDurationSeconds: 60,
});

type InspectionStatus = "passed" | "failed" | "unverified";
type Inspection<T> = { status: InspectionStatus; evidence?: T };
type SchedulerEvidence = {
  base: SchedulerBaseInventory;
  installed: SchedulerInstalledInventory | null;
  checks: ReturnType<typeof schedulerChecks>;
};

function schedulerChecks(base: SchedulerBaseInventory, installed: SchedulerInstalledInventory | null) {
  return {
    expectedDatabaseSession: base.databaseName === "postgres" && base.postgresSession,
    extensionsInstalled: base.extensions.every((extension) => extension.installedVersion !== null),
    relationsPresent: base.installedRelationsPresent,
    functionContractsPresent: base.functions.every((fn) => fn.exists && fn.ownerTrusted && fn.searchPathSafe),
    wrapperMatches: base.wrapperContractMatches,
    effectivePrivilegesRestricted: [base.unsafeTablePrivileges, base.unsafeColumnPrivileges,
      base.unsafeSequencePrivileges, base.unsafeFunctionPrivileges, base.unsafeSchemaCreatePrivileges,
      base.unsafeRoleMemberships, base.unsafeViews, base.unsafeDefinerWrappers].every((count) => count === 0),
    catalogExecutionPreserved: base.catalogExecutionPreserved && base.catalogTriggerCount > 0,
    jobIdentityMatches: installed !== null && installed.jobCount === 1 && installed.matchingJobCount === 1
      && installed.otherPaymentJobCount === 0 && installed.activeJobCount <= 1,
    credentialStored: installed !== null && installed.secretCount === 1 && installed.secretShapeValid,
  };
}
const STATES = ["pending", "processing", "processed", "ignored", "dead_letter"] as const;
const INVALID = "[payments-plan] Invalid inspection data.";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(INVALID);
  return value as Record<string, unknown>;
}
function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(INVALID);
  return Number(value);
}
function identifier(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || value.length > 255 || !pattern.test(value)) throw new Error(INVALID);
  return value;
}
function instant(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(INVALID);
  return new Date(value).toISOString();
}
function age(value: unknown, now: Date): number | null {
  const date = instant(value);
  if (date === null) return null;
  if (Date.parse(date) > now.getTime() + 60_000) throw new Error(INVALID);
  return Math.max(0, Math.floor((now.getTime() - Date.parse(date)) / 1000));
}

/** Explicit projection: this CLI must never print raw RPC/provider objects or errors. */
function summarizeOperations(input: unknown, now: Date) {
  const source = object(input);
  if (source.accountId !== PAYMENT_SCHEDULER.accountId || source.environment !== "sandbox") throw new Error(INVALID);
  const heartbeat = object(source.heartbeat);
  const counts = object(source.counts);
  const heartbeatAge = age(heartbeat.completedAt, now);
  const oldestPendingAgeSeconds = age(source.oldestPendingAt, now);
  if (!Array.isArray(source.items) || source.items.length > 100) throw new Error(INVALID);
  return {
    observedAt: instant(source.observedAt),
    heartbeat: {
      startedAt: instant(heartbeat.startedAt), completedAt: instant(heartbeat.completedAt),
      ageSeconds: heartbeatAge, stale: heartbeatAge === null || heartbeatAge >= 300,
      processedCount: integer(heartbeat.processedCount), failureCount: integer(heartbeat.failureCount),
    },
    counts: Object.fromEntries(STATES.map((state) => [state, integer(counts[state])])),
    oldestPendingAgeSeconds,
    overdue: oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds >= 900,
    items: source.items.map((value) => {
      const item = object(value);
      if (!STATES.some((state) => state === item.state) || typeof item.replayEligible !== "boolean") throw new Error(INVALID);
      return {
        id: identifier(item.id, /^[a-f0-9-]{36}$/i),
        eventId: identifier(item.eventId, /^evt_[A-Za-z0-9_]+$/),
        objectId: item.objectId === null ? null : identifier(item.objectId, /^(cs_test_|ch_|py_|re_|pyr_)[A-Za-z0-9_]+$/),
        state: item.state as typeof STATES[number], attempts: integer(item.attempts),
        ageSeconds: age(item.receivedAt, now), replayEligible: item.replayEligible,
      };
    }),
  };
}

export function buildPaymentsPlan(input: {
  operations?: unknown; now?: Date;
  stripe?: Inspection<{ endpointIdentityMatches: boolean; eventsMatch: boolean }>;
  database?: Inspection<SchedulerEvidence>;
  operationsStatus?: InspectionStatus;
  localConfiguration?: { managementCredentialPresent: boolean; serviceCredentialPresent: boolean; stripeTestCredentialPresent: boolean; workerCredentialPresent: boolean };
} = {}) {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error(INVALID);
  return {
    mode: "read-only" as const,
    activationReady: false as const,
    observedAt: now.toISOString(),
    scheduler: PAYMENT_SCHEDULER,
    stripe: input.stripe ?? { status: "unverified" as const },
    database: input.database ?? { status: "unverified" as const },
    localConfiguration: input.localConfiguration ?? null,
    operationsStatus: input.operationsStatus ?? (input.operations === undefined ? "unverified" : "passed"),
    operations: input.operations === undefined ? null : summarizeOperations(input.operations, now),
    preconditions: {
      allTicketsIntegratedAtReviewedDevSha: "unverified",
      deploymentMapping: "unverified",
      allCatalogConsumersProtected: "unverified",
      planCapacity: "unverified",
      operatorAssigned: "unverified",
      installedSignaturesAndEffectiveGrants: "unverified",
      credentialPrivacyAndCatalogDelivery: "unverified",
      vaultAndVercelCredentialAgreement: "unverified",
      authenticatedWorkerAndSignedDelivery: "unverified",
      observedHostedHeartbeat: "unverified",
    },
    activationSteps: [
      "Verify the merged Spec SHA, exact nonproduction deployment and every shared catalog consumer; preserve settlement while blocking new creation.",
      "Verify current no-upgrade plan capacity, 60-second Node route duration, approved project identity and an assigned active admin Operator.",
      "Apply reviewed compatible payment migrations; inspect extension availability, actual versions, signatures, job drift and effective ACLs.",
      "Prepare the fixed wrapper and inactive minute schedule from scripts/payments/scheduler.sql; run real privilege-denial and unchanged catalog delivery checks.",
      "Provision the same dedicated 32-byte credential through Vault and Vercel secure stores without printing it; verify references and credential agreement.",
      "Update only the existing Stripe endpoint event list to the exact eight events, preserving endpoint, API version and signing secret.",
      "After fresh manifest checks, enable the one reviewed job; prove signed delivery, authenticated wakeups and completed worker heartbeat without local forwarding.",
      "The assigned Operator inspects /admin/payments every five minutes and at run end; retain sanitized evidence and keep admission off until all #413 checks pass.",
    ],
  };
}

function assertConfiguration(env: Record<string, string | undefined>) {
  const expected: Record<string, string> = {
    SUPABASE_PROJECT_REF: PAYMENT_SCHEDULER.projectRef,
    NEXT_PUBLIC_SUPABASE_URL: `https://${PAYMENT_SCHEDULER.projectRef}.supabase.co`,
    CHECKOUT_MODE: "sandbox", STRIPE_ACCOUNT_ID: PAYMENT_SCHEDULER.accountId,
    STRIPE_WEBHOOK_ENDPOINT_ID: PAYMENT_SCHEDULER.endpointId,
    CHECKOUT_ORIGIN: "https://helixskin.vercel.app",
  };
  if (Object.entries(expected).some(([name, value]) => env[name] && env[name] !== value)
    || (env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.startsWith("sk_test_"))) {
    throw new Error("[payments-plan] Approved sandbox configuration mismatch.");
  }
}

async function readJson(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(10_000), redirect: "error", cache: "no-store" });
  if (!response.ok) throw new Error("[payments-plan] Inspection unavailable.");
  return response.json();
}

export async function runPaymentsPlan(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch) {
  assertConfiguration(env);
  let stripe: Inspection<{ endpointIdentityMatches: boolean; eventsMatch: boolean }> = { status: "unverified" };
  let database: Inspection<SchedulerEvidence> = { status: "unverified" };
  let operations: unknown;
  if (env.STRIPE_SECRET_KEY) {
    try {
      const headers = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Stripe-Version": STRIPE_API_VERSION };
      const account = object(await readJson(fetchImpl, "https://api.stripe.com/v1/account", { headers }));
      if (account.id !== PAYMENT_SCHEDULER.accountId) {
        stripe = { status: "failed" };
      } else {
        const endpoint = object(await readJson(fetchImpl, `https://api.stripe.com/v1/webhook_endpoints/${PAYMENT_SCHEDULER.endpointId}`, { headers }));
        const endpointIdentityMatches = endpoint.id === PAYMENT_SCHEDULER.endpointId && endpoint.api_version === STRIPE_API_VERSION
          && endpoint.livemode === false && endpoint.status === "enabled" && endpoint.url === PAYMENT_SCHEDULER.webhookUrl;
        const eventsMatch = Array.isArray(endpoint.enabled_events)
          && [...endpoint.enabled_events].sort().join("\n") === [...PAYMENT_SCHEDULER.events].sort().join("\n");
        stripe = { status: endpointIdentityMatches && eventsMatch ? "passed" : "failed", evidence: { endpointIdentityMatches, eventsMatch } };
      }
    } catch { /* Unavailable reads remain unverified; never emit provider errors. */ }
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const value = await readJson(fetchImpl, `https://${PAYMENT_SCHEDULER.projectRef}.supabase.co/rest/v1/rpc/read_payment_operations`, {
        method: "POST", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" }, body: "{}",
      });
      summarizeOperations(value, new Date());
      operations = value;
    } catch { /* Missing migration or denied inspection must not leak a response. */ }
  }
  if (env.SUPABASE_ACCESS_TOKEN) {
    try {
      const query = (sql: string) => readJson(fetchImpl,
        `https://api.supabase.com/v1/projects/${PAYMENT_SCHEDULER.projectRef}/database/query/read-only`, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: sql }),
        });
      const base = parseSchedulerBaseInventory(await query(PAYMENT_SCHEDULER_BASE_INVENTORY_SQL));
      // Missing extensions are ordinary pre-activation state. Never reference
      // their tables until the catalog-only inventory confirms they exist.
      const installed = base.installedRelationsPresent
        && base.extensions.every((extension) => extension.installedVersion !== null)
        ? parseSchedulerInstalledInventory(await query(PAYMENT_SCHEDULER_INSTALLED_INVENTORY_SQL)) : null;
      const checks = schedulerChecks(base, installed);
      database = { status: Object.values(checks).every(Boolean) ? "passed" : "failed", evidence: { base, installed, checks } };
    } catch { /* Missing/denied/partial reads remain unverified, with no SQL/provider errors printed. */ }
  }
  return buildPaymentsPlan({
    operations, stripe, database,
    localConfiguration: {
      managementCredentialPresent: Boolean(env.SUPABASE_ACCESS_TOKEN),
      serviceCredentialPresent: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      stripeTestCredentialPresent: Boolean(env.STRIPE_SECRET_KEY),
      workerCredentialPresent: Boolean(env.PAYMENT_WORKER_SECRET),
    },
  });
}
