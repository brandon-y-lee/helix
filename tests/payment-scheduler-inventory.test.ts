import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseSchedulerBaseInventory,
  parseSchedulerInstalledInventory,
  PAYMENT_SCHEDULER_WRAPPER_BODY_MD5,
} from "../scripts/payments/scheduler-inventory";

function base() {
  return {
    databaseName: "postgres", postgresSession: true,
    extensions: ["pg_net", "pg_cron", "supabase_vault"].map((name) => ({
      name, installedVersion: null, availableVersion: "0.20.4",
    })),
    functions: [
      "net.http_post(text,jsonb,jsonb,jsonb,integer)",
      "supabase_functions.http_request()",
      "cron.schedule(text,text,text)",
      "cron.alter_job(bigint,text,text,text,text,boolean)",
      "private.wake_sandbox_payment_worker()",
    ].map((signature) => ({
      signature, exists: false, ownerTrusted: false, securityDefiner: false,
      searchPathSafe: false,
    })),
    installedRelationsPresent: false, wrapperContractMatches: false,
    unsafeTablePrivileges: 0, unsafeColumnPrivileges: 0, unsafeSequencePrivileges: 0,
    unsafeFunctionPrivileges: 0, unsafeSchemaCreatePrivileges: 0, unsafeRoleMemberships: 0,
    unsafeViews: 0, unsafeDefinerWrappers: 0, customDefinerSignatures: [
      "public.catalog_publish(uuid, text, timestamp with time zone, public.enum_type[])",
    ],
    catalogTriggerCount: 0, catalogExecutionPreserved: false,
  };
}

describe("redacted scheduler inventory boundary", () => {
  it("accepts absent extensions and projects only reviewed fields", () => {
    const item = base();
    expect(parseSchedulerBaseInventory([{ inventory: {
      ...item, rawHeaders: "Bearer secret-canary", command: "select secret-canary",
    } }])).toEqual(item);
  });

  it.each([
    (item: ReturnType<typeof base>) => { item.databaseName = "secret-canary"; },
    (item: ReturnType<typeof base>) => { item.extensions[0].availableVersion = "private@example.com"; },
    (item: ReturnType<typeof base>) => { item.extensions[0].name = "private@example.com"; },
    (item: ReturnType<typeof base>) => { item.extensions.pop(); },
    (item: ReturnType<typeof base>) => { item.functions[0].signature = "select secret-canary"; },
    (item: ReturnType<typeof base>) => { item.functions.pop(); },
    (item: ReturnType<typeof base>) => { item.functions[0] = item.functions[1]; },
    (item: ReturnType<typeof base>) => { item.customDefinerSignatures = ["public.fn(text); select secret"]; },
    (item: ReturnType<typeof base>) => { item.customDefinerSignatures = ["public.fn(\"secret-canary\")"]; },
    (item: ReturnType<typeof base>) => { item.customDefinerSignatures = ["Bearer secret-canary"]; },
    (item: ReturnType<typeof base>) => { item.customDefinerSignatures = Array.from({ length: 257 }, (_, i) => `public.fn_${i}()`); },
    (item: ReturnType<typeof base>) => { item.customDefinerSignatures = ["public.fn()", "public.fn()"]; },
    (item: ReturnType<typeof base>) => { item.unsafeViews = -1; },
    (item: ReturnType<typeof base>) => { item.unsafeViews = 1.1; },
  ])("rejects malformed or non-projected text with a redacted error", (mutate) => {
    const item = base();
    mutate(item);
    expect(() => parseSchedulerBaseInventory([{ inventory: item }])).toThrow(/^Invalid scheduler/);
  });

  it("requires one plain row and actual boolean flags", () => {
    for (const response of [[], [{ inventory: base() }, { inventory: base() }], { data: [{ inventory: base() }] },
      [{ inventory: { ...base(), postgresSession: "true" } }]]) {
      expect(() => parseSchedulerBaseInventory(response)).toThrow(/^Invalid scheduler/);
    }
  });

  it("validates installed evidence and never includes raw credential columns", () => {
    const item = { jobCount: 1, matchingJobCount: 1, activeJobCount: 0,
      otherPaymentJobCount: 0, secretCount: 0, secretShapeValid: false };
    expect(parseSchedulerInstalledInventory([{ inventory: { ...item,
      decrypted_secret: "secret-canary", headers: "secret-canary", return_message: "secret-canary",
    } }])).toEqual(item);
    expect(() => parseSchedulerInstalledInventory([{ inventory: { ...item, secretCount: "0" } }]))
      .toThrow(/^Invalid scheduler/);
  });

  it("keeps the public wrapper fingerprint tied to the reviewed SQL body", () => {
    const template = readFileSync("scripts/payments/scheduler.sql", "utf8");
    const body = template.split("v_body text := $worker$")[1].split("$worker$;")[0];
    expect(createHash("md5").update(body).digest("hex")).toBe(PAYMENT_SCHEDULER_WRAPPER_BODY_MD5);
  });
});
