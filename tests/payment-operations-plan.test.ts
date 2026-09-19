import { describe, expect, it, vi } from "vitest";
import { buildPaymentsPlan, runPaymentsPlan, PAYMENT_SCHEDULER } from "../scripts/payments/operations-plan";
import { runPaymentsPlanCli } from "../scripts/payments/plan";
import { PAYMENT_SCHEDULER_BASE_INVENTORY_SQL, PAYMENT_SCHEDULER_INSTALLED_INVENTORY_SQL } from "../scripts/payments/scheduler-inventory";

const baseInventory = {
  databaseName: "postgres", postgresSession: true,
  extensions: [
    { name: "pg_net", installedVersion: "0.20.3", availableVersion: "0.20.3" },
    { name: "pg_cron", installedVersion: "1.6.4", availableVersion: "1.6.4" },
    { name: "supabase_vault", installedVersion: "0.3.1", availableVersion: "0.3.1" },
  ],
  functions: [
    "net.http_post(text,jsonb,jsonb,jsonb,integer)", "supabase_functions.http_request()",
    "cron.schedule(text,text,text)", "cron.alter_job(bigint,text,text,text,text,boolean)",
    "private.wake_sandbox_payment_worker()",
  ].map((signature) => ({ signature, exists: true, ownerTrusted: true, securityDefiner: signature.startsWith("net.") || signature.startsWith("supabase_functions."), searchPathSafe: true })),
  installedRelationsPresent: true, wrapperContractMatches: true,
  unsafeTablePrivileges: 0, unsafeColumnPrivileges: 0, unsafeSequencePrivileges: 0,
  unsafeFunctionPrivileges: 0, unsafeSchemaCreatePrivileges: 0, unsafeRoleMemberships: 0,
  unsafeViews: 0, unsafeDefinerWrappers: 0, customDefinerSignatures: [],
  catalogTriggerCount: 6, catalogExecutionPreserved: true,
};
const installedInventory = { jobCount: 1, matchingJobCount: 1, activeJobCount: 0, otherPaymentJobCount: 0, secretCount: 1, secretShapeValid: true };

const env = {
  SUPABASE_PROJECT_REF: "erasogmsqpgiirovubjh",
  NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co",
  CHECKOUT_MODE: "sandbox", STRIPE_ACCOUNT_ID: "acct_1Tm9WRFEzyaKzdmq",
};
const operations = {
  accountId: env.STRIPE_ACCOUNT_ID, environment: "sandbox", observedAt: "2026-09-19T12:00:00Z",
  heartbeat: { startedAt: "2026-09-19T11:59:00Z", completedAt: "2026-09-19T11:55:00Z", processedCount: 2, failureCount: 0 },
  counts: { pending: 1, processing: 0, processed: 2, ignored: 0, dead_letter: 0 },
  oldestPendingAt: "2026-09-19T11:45:00Z",
  items: [{ id: "00000000-0000-4000-8000-000000000001", eventId: "evt_safe", objectId: "cs_test_safe", state: "pending", attempts: 1, receivedAt: "2026-09-19T11:45:00Z", replayEligible: false, email: "private@example.com" }],
  email: "private@example.com", secret: "secret-leak-canary",
};

describe("read-only hosted payments plan", () => {
  it("rejects every mutation and destination command", async () => {
    for (const argv of [["apply"], ["replay"], ["plan", "--url", "https://attacker.test"]]) {
      await expect(runPaymentsPlanCli(argv, process.env)).rejects.toThrow("Only read-only plan");
    }
  });

  it("plans the exact refund additions without replacing the endpoint or signing secret", () => {
    expect(PAYMENT_SCHEDULER.events).toEqual([
      "charge.refunded", "checkout.session.async_payment_failed",
      "checkout.session.async_payment_succeeded", "checkout.session.completed",
      "checkout.session.expired", "refund.created", "refund.updated", "refund.failed",
    ]);
    expect(PAYMENT_SCHEDULER.endpointId).toBe("we_1U6GHJFEzyaKzdmqVxkG9jRC");
    expect(PAYMENT_SCHEDULER.apiVersion).toBe("2026-06-24.dahlia");
  });
  it("defaults missing prerequisites to unverified without network or mutations", async () => {
    const fetchImpl = vi.fn();
    const report = await runPaymentsPlan({}, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(report.activationReady).toBe(false);
    expect(report.mode).toBe("read-only");
    expect(report.preconditions.deploymentMapping).toBe("unverified");
    expect(report.preconditions.operatorAssigned).toBe("unverified");
    expect(report.preconditions.planCapacity).toBe("unverified");
  });

  it.each([
    { SUPABASE_PROJECT_REF: "foreign" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co@attacker.test" },
    { CHECKOUT_MODE: "live" }, { STRIPE_ACCOUNT_ID: "acct_foreign" },
    { STRIPE_SECRET_KEY: "sk_live_canary" },
    { CHECKOUT_ORIGIN: "https://attacker.test" },
    { STRIPE_WEBHOOK_ENDPOINT_ID: "we_foreign" },
  ])("rejects identity drift before sending credentials: %j", async (drift) => {
    const fetchImpl = vi.fn();
    await expect(runPaymentsPlan({ ...env, ...drift }, fetchImpl)).rejects.toThrow("configuration mismatch");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("derives five-minute heartbeat and fifteen-minute queue health at read time", () => {
    const report = buildPaymentsPlan({ operations, now: new Date("2026-09-19T12:00:00Z") });
    expect(report.operations?.heartbeat.stale).toBe(true);
    expect(report.operations?.oldestPendingAgeSeconds).toBe(900);
    expect(report.operations?.overdue).toBe(true);
    expect(report.operations?.items[0]).toEqual({
      id: "00000000-0000-4000-8000-000000000001", eventId: "evt_safe", objectId: "cs_test_safe",
      state: "pending", attempts: 1, ageSeconds: 900, replayEligible: false,
    });
    expect(JSON.stringify(report)).not.toContain("private@example.com");
    expect(JSON.stringify(report)).not.toContain("secret-leak-canary");
  });

  it("never promotes local presence, healthy heartbeat, or a proposed fixed URL to hosted activation proof", () => {
    const report = buildPaymentsPlan({ operations, now: new Date("2026-09-19T11:59:59Z") });
    expect(report.operations?.heartbeat.stale).toBe(false);
    expect(report.activationReady).toBe(false);
    expect(report.scheduler.url).toBe("https://helixskin.vercel.app/api/internal/payments/reconcile");
    expect(report.preconditions.deploymentMapping).toBe("unverified");
    expect(report.scheduler.timeoutMs).toBe(50_000);
    expect(report.scheduler.cadence).toBe("* * * * *");
  });

  it("retains unresolvable legacy identifiers as null rather than hiding all operations", () => {
    const report = buildPaymentsPlan({
      operations: { ...operations, items: [{ ...operations.items[0], objectId: null, state: "dead_letter" }] },
      now: new Date("2026-09-19T12:00:00Z"),
    });
    expect(report.operations?.items[0].objectId).toBeNull();
    expect(report.operations?.items[0].state).toBe("dead_letter");
  });

  it.each(["py_safe", "pyr_safe"])("retains supported legacy provider identifiers: %s", (objectId) => {
    const report = buildPaymentsPlan({
      operations: { ...operations, items: [{ ...operations.items[0], objectId }] },
      now: new Date("2026-09-19T12:00:00Z"),
    });
    expect(report.operations?.items[0].objectId).toBe(objectId);
  });

  it("rejects wrong-account and malformed operations instead of exposing provider data", () => {
    expect(() => buildPaymentsPlan({ operations: { ...operations, accountId: "acct_foreign" } })).toThrow("Invalid inspection");
    expect(() => buildPaymentsPlan({ operations: { ...operations, counts: {} } })).toThrow("Invalid inspection");
    expect(() => buildPaymentsPlan({ operations: { ...operations, items: [{ ...operations.items[0], eventId: "private@example.com" }] } })).toThrow("Invalid inspection");
  });

  it("makes only authenticated reads and requests the exact eight-event endpoint without modifying it", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/v1/account")) return Response.json({ id: env.STRIPE_ACCOUNT_ID, secret: "ignored" });
      if (value.includes("webhook_endpoints")) return Response.json({ id: PAYMENT_SCHEDULER.endpointId, api_version: PAYMENT_SCHEDULER.apiVersion, livemode: false, status: "enabled", url: PAYMENT_SCHEDULER.webhookUrl, enabled_events: PAYMENT_SCHEDULER.events });
      if (value.endsWith("/rpc/read_payment_operations")) {
        const observedAt = new Date().toISOString();
        return Response.json({ ...operations, observedAt, oldestPendingAt: observedAt,
          heartbeat: { ...operations.heartbeat, startedAt: observedAt, completedAt: observedAt },
          items: operations.items.map((item) => ({ ...item, receivedAt: observedAt })),
        });
      }
      throw new Error("unexpected request");
    });
    const report = await runPaymentsPlan({ ...env, STRIPE_SECRET_KEY: "sk_test_example", SUPABASE_SERVICE_ROLE_KEY: "service-secret-canary" }, fetchImpl);
    expect(report.stripe.status).toBe("passed");
    expect(report.operationsStatus).toBe("passed");
    expect(report.operations?.heartbeat.stale).toBe(false);
    expect(report.operations?.items[0]?.state).toBe("pending");
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.stripe.com/v1/account",
      `https://api.stripe.com/v1/webhook_endpoints/${PAYMENT_SCHEDULER.endpointId}`,
      "https://erasogmsqpgiirovubjh.supabase.co/rest/v1/rpc/read_payment_operations",
    ]);
    expect(JSON.stringify(report)).not.toContain("service-secret-canary");
  });

  it("does not read an endpoint after actual account verification fails", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: "acct_foreign" }));
    const report = await runPaymentsPlan({ ...env, STRIPE_SECRET_KEY: "sk_test_example" }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(report.stripe.status).toBe("failed");
  });

  it("uses only the enforced read-only query endpoint and projects both inventory stages", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([{ inventory: { ...baseInventory, rawSecret: "not-output" } }]))
      .mockResolvedValueOnce(Response.json([{ inventory: { ...installedInventory, decrypted_secret: "not-output" } }]));
    const report = await runPaymentsPlan({ ...env, SUPABASE_ACCESS_TOKEN: "management-secret-canary" }, fetchImpl);
    expect(report.database.status).toBe("passed");
    expect(report.database.evidence?.installed).toEqual(installedInventory);
    expect(report.database.evidence?.checks.effectivePrivilegesRestricted).toBe(true);
    expect(report.activationReady).toBe(false);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url).toBe("https://api.supabase.com/v1/projects/erasogmsqpgiirovubjh/database/query/read-only");
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer management-secret-canary" });
    }
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({ query: PAYMENT_SCHEDULER_BASE_INVENTORY_SQL });
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual({ query: PAYMENT_SCHEDULER_INSTALLED_INVENTORY_SQL });
    expect(JSON.stringify(report)).not.toContain("management-secret-canary");
    expect(JSON.stringify(report)).not.toContain("not-output");
  });

  it("reports absent extensions without querying missing tables", async () => {
    const base = { ...baseInventory, installedRelationsPresent: false, extensions: baseInventory.extensions.map((entry) => ({ ...entry, installedVersion: null })) };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json([{ inventory: base }]));
    const report = await runPaymentsPlan({ SUPABASE_ACCESS_TOKEN: "test" }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(report.database.status).toBe("failed");
    expect(report.database.evidence?.checks.extensionsInstalled).toBe(false);
    expect(report.database.evidence?.installed).toBeNull();
  });

  it.each([
    { unsafeColumnPrivileges: 1 }, { unsafeSequencePrivileges: 1 }, { unsafeRoleMemberships: 1 },
    { wrapperContractMatches: false }, { catalogExecutionPreserved: false },
  ])("does not approve unsafe infrastructure: %j", async (drift) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([{ inventory: { ...baseInventory, ...drift } }]))
      .mockResolvedValueOnce(Response.json([{ inventory: installedInventory }]));
    const report = await runPaymentsPlan({ SUPABASE_ACCESS_TOKEN: "test" }, fetchImpl);
    expect(report.database.status).toBe("failed");
    expect(report.activationReady).toBe(false);
  });

  it.each([
    { jobCount: 2 }, { matchingJobCount: 0 }, { otherPaymentJobCount: 1 },
    { activeJobCount: 2 }, { secretCount: 0 }, { secretShapeValid: false },
  ])("retains exact job/credential prerequisite failures: %j", async (drift) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([{ inventory: baseInventory }]))
      .mockResolvedValueOnce(Response.json([{ inventory: { ...installedInventory, ...drift } }]));
    const report = await runPaymentsPlan({ SUPABASE_ACCESS_TOKEN: "test" }, fetchImpl);
    expect(report.database.status).toBe("failed");
  });

  it("does not pass a partial read or expose its database error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([{ inventory: baseInventory }]))
      .mockRejectedValueOnce(new Error("credential-secret-canary"));
    const report = await runPaymentsPlan({ SUPABASE_ACCESS_TOKEN: "test" }, fetchImpl);
    expect(report.database.status).toBe("unverified");
    expect(JSON.stringify(report)).not.toContain("canary");
  });

  it("redacts transport failures and endpoint errors", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("Authorization: Bearer secret-leak-canary"); });
    const report = await runPaymentsPlan({ ...env, STRIPE_SECRET_KEY: "sk_test_example", SUPABASE_ACCESS_TOKEN: "management-secret-canary" }, fetchImpl);
    expect(report.stripe.status).toBe("unverified");
    expect(report.database.status).toBe("unverified");
    expect(JSON.stringify(report)).not.toContain("canary");
  });
});
