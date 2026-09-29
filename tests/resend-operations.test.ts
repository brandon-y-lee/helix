// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildAuthEmailTemplates } from "@/lib/email/auth-templates";
import { runAuthEmailCommand } from "@/scripts/auth-email/operations";
import { type LocalEvidence, CONTROL_READS, PROOF_KINDS, SCHEDULES, TARGET, WEBHOOK_EVENTS, fingerprint, parseCommand,
  runResendOperations, templateContentFingerprint, type Manifest } from "@/scripts/resend-operations/operations";

const digest = (v: string) => createHash("sha256").update(v).digest("hex");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const stamp = "2026-09-29T01:00:00.000Z";
async function setup() {
  const purposeNames = ["marketing_confirmation", "welcome_initial", "welcome_education"] as const;
  const native = Object.fromEntries(purposeNames.map((purpose, i) => [purpose, {
    id: id(i + 1), alias: `helix-r1-${purpose.replaceAll("_", "-")}`, current_version_id: id(i + 11), status: "published", has_unpublished_versions: false,
    subject: purpose, html: "<p>{{HELIX_CONFIRM_URL}} {{HELIX_PREFERENCES_URL}} {{HELIX_POSTAL_ADDRESS}}</p>",
    text: "{{HELIX_CONFIRM_URL}} {{HELIX_PREFERENCES_URL}} {{HELIX_POSTAL_ADDRESS}}", from: null, reply_to: null,
  }]));
  const templates = Object.fromEntries(purposeNames.map(p => [p, { alias: native[p].alias, contentSha256: templateContentFingerprint(native[p]) }])) as Manifest["templates"];
  const controls: Record<string, unknown> = Object.fromEntries(Object.keys(CONTROL_READS).map(k => [k, { enabled: false, updatedAt: stamp, acceptedAfter: stamp }]));
  controls.marketing = purposeNames.map(purpose => ({ purpose, enabled: false, updatedAt: stamp, acceptedAfter: stamp }));
  controls.product = ["product_availability", "product_waitlist_recovery"].map(purpose => ({ purpose, enabled: false, updatedAt: stamp, acceptedAfter: stamp }));
  const current = { controls, smtp: {
    ...buildAuthEmailTemplates(TARGET.origin), site_url: TARGET.origin, smtp_host: "smtp.resend.com", smtp_port: "465", smtp_user: "resend",
    smtp_admin_email: "onboarding@resend.dev", smtp_sender_name: "Helix", smtp_pass: "private-old-password", external_email_enabled: true,
    mailer_autoconfirm: false, mailer_secure_email_change_enabled: true, hook_send_email_enabled: false, mailer_otp_exp: 3600,
  } as Record<string, unknown>, missing: false, drift: false, patchChangesSecurity: false, envDrift: false, sensitive: false };
  const secrets = ["RESEND_API_KEY", "RESEND_RECEIVING_API_KEY", "RESEND_WEBHOOK_SECRET", "HELIX_EMAIL_DISPATCH_SECRET",
    "HELIX_SUPPORT_INGEST_SECRET", "HELIX_SUPPORT_RETENTION_SECRET", "HELIX_SUPPORT_PHOTO_ACCESS_SECRET", "HELIX_SUPPORT_AI_WORKER_SECRET"];
  const env: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: `https://${TARGET.project}.supabase.co`, HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted",
    HELIX_EMAIL_SITE_ORIGIN: TARGET.origin, HELIX_EMAIL_OWNER_RECIPIENT: "owner@example.test", HELIX_EMAIL_ALLOW_SIMULATORS: "true",
    HELIX_EMAIL_ORDER_FROM: "Helix <onboarding@resend.dev>", HELIX_EMAIL_SUPPORT_FROM: "Helix <onboarding@resend.dev>",
    HELIX_EMAIL_PRODUCT_FROM: "Helix <onboarding@resend.dev>", HELIX_EMAIL_AUTH_FROM: "onboarding@resend.dev",
    HELIX_EMAIL_REPLY_TO: "support@assigned.resend.app", HELIX_SUPPORT_RECEIVING_ADDRESS: "support@assigned.resend.app", HELIX_SUPPORT_PHOTO_BUCKET: "helix-support",
    SUPABASE_ACCESS_TOKEN: "private-management-token", SUPABASE_SERVICE_ROLE_KEY: "private-service-role", VERCEL_ACCESS_TOKEN: "private-vercel-token",
    ...Object.fromEntries(secrets.map(k => [k, `private-${k.toLowerCase()}`])),
  };
  const runtimeTemplates = Object.fromEntries(purposeNames.map(p => [p, { id: native[p].id, sha256: digest(JSON.stringify({
    id: native[p].id, version: native[p].current_version_id, subject: native[p].subject, html: native[p].html, text: native[p].text,
    from: native[p].from, replyTo: native[p].reply_to,
  })) }]));
  env.HELIX_EMAIL_MARKETING_CONTRACT = JSON.stringify({ version: "welcome_v1", siteOrigin: TARGET.origin, from: "Helix <onboarding@resend.dev>",
    replyTo: env.HELIX_EMAIL_REPLY_TO, postalAddress: "Approved postal identity", topicId: id(50), templates: runtimeTemplates });
  const baseline = await runAuthEmailCommand(["verify"], env, buildAuthEmailTemplates, async () => new Response(JSON.stringify(current.smtp)));
  const manifest: Manifest = {
    version: 1, codeSha: "b".repeat(40), project: TARGET.project, origin: TARGET.origin, ownerRecipient: env.HELIX_EMAIL_OWNER_RECIPIENT,
    allowSimulators: true, receivingAddress: env.HELIX_EMAIL_REPLY_TO, photoBucket: "helix-support", postalAddress: "Approved postal identity", topicName: "Helix restricted welcome",
    templates, migrations: [{ file: "20260929005855_order_confirmation_email.sql", sha256: "1".repeat(64) }],
    credentialVersions: Object.fromEntries(secrets.map(k => [k, { version: "private-v1", sha256: digest(env[k]) }])),
    evidence: Object.fromEntries(PROOF_KINDS.map(kind => [kind, { file: `/private/evidence/${kind}`, sha256: "2".repeat(64) }])) as Manifest["evidence"],
    setupReceiptFile: "/private/evidence/setup-receipt.json",
    smtp: { change: false, beforeFingerprint: baseline.observedFingerprint!, rollbackReference: "private-before-state-v1" },
    expectedControlsFingerprint: fingerprint(controls), enable: { confirmation: true, tracking: true, support: true, receiving: true, marketing: true, product: true },
  };
  const local: LocalEvidence = { codeSha: manifest.codeSha, clean: true, migrations: { [manifest.migrations[0].file]: "1".repeat(64) },
    evidence: Object.fromEntries(Object.values(manifest.evidence).map(e => [e.file, e.sha256!])) };
  const fetcher = vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const url = new URL(String(input)), method = options?.method ?? "GET";
    const body = options?.body ? JSON.parse(String(options.body)) as Record<string, unknown> : {};
    const response = (value: unknown) => new Response(JSON.stringify(value));
    if (url.hostname === "api.supabase.com" && url.pathname.endsWith(`/projects/${TARGET.project}`)) return response({ id: TARGET.project, status: "ACTIVE_HEALTHY" });
    if (url.pathname.includes("/rpc/")) {
      expect((options?.headers as Record<string, string>).apikey).toBe(env.SUPABASE_SERVICE_ROLE_KEY);
      return response(current.controls[Object.entries(CONTROL_READS).find(([, fn]) => url.pathname.endsWith(fn))![0]]);
    }
    if (url.pathname.endsWith("/config/auth")) {
      if (method === "PATCH") { Object.assign(current.smtp, body); if (current.patchChangesSecurity) current.smtp.mailer_otp_exp = 1; }
      return response(current.smtp);
    }
    if (url.hostname === "api.vercel.com") {
      if (url.pathname.includes("/aliases/")) return response({ deployment: { id: "dpl_qualified" } });
      if (url.pathname.includes("/deployments/")) return response({ id: "dpl_qualified", projectId: TARGET.vercelProject, readyState: "READY", target: null,
        createdAt: 1000, meta: { githubCommitRef: "dev", githubCommitSha: current.drift ? "c".repeat(40) : manifest.codeSha } });
      if (url.pathname.endsWith("/env")) return response({ envs: [...Object.entries(env).filter(([k]) => !["SUPABASE_ACCESS_TOKEN", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_ACCESS_TOKEN"].includes(k)),
        ["HELIX_MARKETING_SYNC_ENABLED", "true"], ["HELIX_SUPPORT_RETENTION_ENABLED", "true"]].map(([key, value]) => ({ key, value: current.envDrift && key === "HELIX_EMAIL_MODE" ? "unrestricted" : value, target: ["preview"], gitBranch: "dev", updatedAt: 500, ...(current.sensitive && secrets.includes(key) ? { type: "sensitive", id: `env_${key}`, value: undefined } : {}) })) });
    }
    if (url.hostname === "api.resend.com") {
      if (current.missing && url.pathname.startsWith("/templates/")) return new Response("provider-private-content", { status: 404 });
      if (url.pathname === "/topics") return response({ data: current.missing ? [] : [{ id: id(50), name: manifest.topicName, default_subscription: "opt_in" }], has_more: false });
      if (url.pathname.startsWith("/templates/")) return response(Object.values(native).find(v => url.pathname.endsWith(v.alias)));
      if (url.pathname === "/webhooks") return response({ data: current.missing ? [] : [{ id: id(51), endpoint: `${TARGET.origin}/api/webhooks/resend` }], has_more: false });
      if (url.pathname.startsWith("/webhooks/")) return response({ id: id(51), endpoint: `${TARGET.origin}/api/webhooks/resend`, status: "enabled", events: WEBHOOK_EVENTS, signing_secret: env.RESEND_WEBHOOK_SECRET });
    }
    if (url.pathname.includes("/storage/v1/bucket/")) return response({ name: manifest.photoBucket, public: false, file_size_limit: 10485760, allowed_mime_types: ["image/webp", "image/jpeg", "image/png"] });
    if (url.pathname.endsWith("/database/query/read-only")) {
      if (String(body.query).includes("schema_migrations")) return response([{ state: { migrations: manifest.migrations.map(m => m.file.slice(0, 14)), cron: true } }]);
      return response(SCHEDULES.map(s => ({ jobname: s.name, schedule: s.schedule, command: s.command, active: true })));
    }
    if (url.pathname.endsWith("/database/query")) {
      const enabled = String(body.query).includes("configure_order_confirmation_email(true");
      current.controls = Object.fromEntries(Object.entries(current.controls).map(([key, value]) => [key, Array.isArray(value)
        ? value.map(v => ({ ...v, enabled })) : { ...(value as Record<string, unknown>), enabled }]));
      return response([]);
    }
    throw new Error(`Unexpected fake provider route: ${url.pathname}`);
  });
  const run = (command: "plan" | "verify" | "apply" | "disable", confirm = true) => {
    const raw = JSON.stringify(manifest); return runResendOperations(command, raw, env, local, fetcher, confirm ? digest(raw) : "0".repeat(64));
  };
  return { manifest, env, local, current, fetcher, run, native };
}
const mutations = (fetcher: Awaited<ReturnType<typeof setup>>["fetcher"]) => fetcher.mock.calls.filter(([url, options]) =>
  options?.method === "PATCH" || new URL(String(url)).pathname.endsWith("/database/query"));

describe("restricted Resend operational command", () => {
  it("plans missing native resources without creating them or hiding read failures", async () => {
    const f = await setup(); f.current.missing = true; delete f.env.VERCEL_ACCESS_TOKEN;
    const result = await f.run("plan");
    expect(result).toMatchObject({ readyForGuardedApply: false, operationalAcceptanceComplete: false,
      findings: expect.arrayContaining(["deployment_read_failed", "topic_missing_or_mismatched", "template_welcome_initial_missing", "webhook_missing_or_ambiguous"]) });
    expect(mutations(f.fetcher)).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/owner@example|private-management|private-service|private-resend|provider-private-content|Approved postal/);
  });

  it("verifies the ready private setup and derives generated IDs without sending mail", async () => {
    const f = await setup(); const result = await f.run("verify");
    expect(result).toMatchObject({ readyForGuardedApply: true, operationalAcceptanceComplete: false, findings: [], observations: { deploymentId: "dpl_qualified", topicId: id(50) } });
    expect(mutations(f.fetcher)).toEqual([]);
    expect(f.fetcher.mock.calls.every(([url]) => !String(url).endsWith("/emails"))).toBe(true);
  });

  it("accepts an approvable setup plan before keys and proof exist, then binds generated receipts to that exact plan", async () => {
    const f = await setup();
    f.manifest.credentialVersions.RESEND_API_KEY = { version: "new-private-v1", generated: true };
    for (const evidence of Object.values(f.manifest.evidence)) evidence.sha256 = null;
    f.manifest.expectedControlsFingerprint = null;
    const pending = await f.run("plan");
    expect(pending).toMatchObject({ readyForGuardedApply: false, findings: expect.arrayContaining(["credential_receipt_missing_or_value_drift", "private_evidence_missing_or_changed"]) });
    expect(mutations(f.fetcher)).toEqual([]);
    f.local.setupReceipt = { manifestSha256: digest(JSON.stringify(f.manifest)), codeSha: f.manifest.codeSha,
      controlsFingerprint: fingerprint(f.current.controls), credentials: { RESEND_API_KEY: { version: "new-private-v1", sha256: digest(f.env.RESEND_API_KEY) } },
      evidence: Object.fromEntries(PROOF_KINDS.map(kind => [kind, "2".repeat(64)])) };
    expect(await f.run("verify")).toMatchObject({ readyForGuardedApply: true, findings: [] });
    (f.local.setupReceipt as { manifestSha256: string }).manifestSha256 = "0".repeat(64);
    await expect(f.run("apply")).rejects.toThrow("activation_preflight_failed");
    expect(mutations(f.fetcher)).toEqual([]);
  });

  it.each([false, true])("limits SMTP writes and checks preserved security fields (drift=%s)", async drift => {
    const f = await setup(); f.current.smtp.smtp_host = "old.private.example";
    const before = await runAuthEmailCommand(["verify"], f.env, buildAuthEmailTemplates, async () => new Response(JSON.stringify(f.current.smtp)));
    f.manifest.smtp = { change: true, beforeFingerprint: before.observedFingerprint!, rollbackReference: "private-recoverable-smtp-backup" };
    f.current.patchChangesSecurity = drift;
    if (drift) await expect(f.run("apply")).rejects.toThrow("smtp_postflight_failed_admission_unchanged");
    else expect(await f.run("apply")).toMatchObject({ applied: true });
    const writes = mutations(f.fetcher), patch = writes.find(([, opts]) => opts?.method === "PATCH")!;
    expect(JSON.parse(String(patch[1]?.body))).toEqual({ ...buildAuthEmailTemplates(TARGET.origin), smtp_host: "smtp.resend.com", smtp_port: "465",
      smtp_user: "resend", smtp_pass: f.env.RESEND_API_KEY, smtp_admin_email: "onboarding@resend.dev", smtp_sender_name: "Helix" });
    if (drift) expect(writes).toHaveLength(1);
    else expect(f.current.smtp.mailer_otp_exp).toBe(3600);
  });

  it("checks sensitive deployment values through exact private setup revisions without requiring impossible decryption", async () => {
    const f = await setup(); f.current.sensitive = true;
    expect(await f.run("verify")).toMatchObject({ readyForGuardedApply: false, findings: expect.arrayContaining(["hosted_sensitive_revision_unbound"]) });
    f.local.setupReceipt = { manifestSha256: digest(JSON.stringify(f.manifest)), codeSha: f.manifest.codeSha,
      controlsFingerprint: fingerprint(f.current.controls), credentials: {}, evidence: {}, environment:
        Object.fromEntries(Object.keys(f.manifest.credentialVersions).map(k => [k, { id: `env_${k}`, updatedAt: 500 }])) };
    expect(await f.run("verify")).toMatchObject({ readyForGuardedApply: true, findings: [] });
    const receipt = f.local.setupReceipt as { environment: Record<string, { updatedAt: number }> };
    receipt.environment.RESEND_API_KEY.updatedAt = 400;
    await expect(f.run("apply")).rejects.toThrow("activation_preflight_failed");
    expect(mutations(f.fetcher)).toEqual([]);
  });

  it("does not mistake matching public SMTP fields for a configured password or excuse unrelated drift", async () => {
    const f = await setup(); f.manifest.smtp.change = true;
    expect(await f.run("apply")).toMatchObject({ applied: true });
    expect(mutations(f.fetcher).some(([, opts]) => opts?.method === "PATCH")).toBe(true);
    f.fetcher.mockClear(); f.current.smtp.mailer_otp_exp = 7200;
    await expect(f.run("apply")).rejects.toThrow("activation_preflight_failed");
    expect(mutations(f.fetcher)).toEqual([]);
  });

  it("requires the exact manifest confirmation before provider access", async () => {
    const f = await setup(); await expect(f.run("apply", false)).rejects.toThrow("manifest_confirmation_mismatch"); expect(f.fetcher).not.toHaveBeenCalled();
  });

  it.each(["deployment", "environment", "secret", "evidence", "migration", "control"])("refuses %s drift without mutations", async kind => {
    const f = await setup();
    if (kind === "deployment") f.current.drift = true;
    if (kind === "environment") f.current.envDrift = true;
    if (kind === "secret") f.env.RESEND_API_KEY = "rotated-but-unapproved";
    if (kind === "evidence") f.local.evidence = {};
    if (kind === "migration") f.local.migrations[f.manifest.migrations[0].file] = "9".repeat(64);
    if (kind === "control") f.current.controls.support = { enabled: false, updatedAt: "2026-09-29T02:00:00.000Z" };
    await expect(f.run("apply")).rejects.toThrow("activation_preflight_failed"); expect(mutations(f.fetcher)).toEqual([]);
  });

  it("applies existing admission controls in one locked CAS transaction and makes repeat apply a no-op", async () => {
    const f = await setup(); expect(await f.run("apply")).toMatchObject({ applied: true });
    const writes = mutations(f.fetcher); expect(writes).toHaveLength(1);
    const sql = JSON.parse(String(writes[0][1]?.body)).query;
    expect(sql).toContain("before_state is distinct from");
    expect(sql).toContain("perform 1 from private.support_controls");
    expect(sql).toContain("public.configure_support_intake(true,((public.read_support_intake_control())->>'updatedAt')::timestamptz)");
    expect(sql).toContain("public.configure_support_receiving(true,((public.read_support_receiving_control())->>'updatedAt')::timestamptz)");
    expect(sql).not.toMatch(/delete from|truncate|stripe|auth.users/i);
    f.fetcher.mockClear();
    await expect(f.run("apply")).rejects.toThrow("activation_preflight_failed");
    expect(mutations(f.fetcher)).toEqual([]);
    f.local.setupReceipt = { manifestSha256: digest(JSON.stringify(f.manifest)), codeSha: f.manifest.codeSha,
      controlsFingerprint: f.manifest.expectedControlsFingerprint, controlsAppliedFingerprint: fingerprint(f.current.controls), credentials: {}, evidence: {} };
    expect(await f.run("apply")).toMatchObject({ applied: true }); expect(mutations(f.fetcher)).toEqual([]);
  });

  it("rejects changed control revisions and cutoffs after an intervening disable/re-enable despite matching booleans", async () => {
    const f = await setup(); await f.run("apply");
    f.local.setupReceipt = { manifestSha256: digest(JSON.stringify(f.manifest)), codeSha: f.manifest.codeSha,
      controlsFingerprint: f.manifest.expectedControlsFingerprint, controlsAppliedFingerprint: fingerprint(f.current.controls), credentials: {}, evidence: {} };
    expect(await f.run("verify")).toMatchObject({ readyForGuardedApply: true, findings: [] });
    const changed = (row: Record<string, unknown>) => ({ ...row, enabled: true, updatedAt: "2026-09-29T03:00:00.000Z", acceptedAfter: "2026-09-29T03:00:00.000Z" });
    f.current.controls = Object.fromEntries(Object.entries(f.current.controls).map(([key, value]) => [key,
      Array.isArray(value) ? value.map(changed) : changed(value as Record<string, unknown>)]));
    f.fetcher.mockClear();
    expect(await f.run("verify")).toMatchObject({ readyForGuardedApply: false, findings: ["control_baseline_drift"] });
    await expect(f.run("apply")).rejects.toThrow("activation_preflight_failed");
    expect(mutations(f.fetcher)).toEqual([]);
  });

  it("disables admission while provider reads are unavailable, preserving cleanup and financial reconciliation", async () => {
    const f = await setup(); await f.run("apply"); f.fetcher.mockClear(); delete f.env.RESEND_API_KEY; delete f.env.VERCEL_ACCESS_TOKEN;
    const result = await f.run("disable");
    expect(result).toMatchObject({ admissionDisabled: true, dispatchPauseRequired: true, preserved: expect.arrayContaining(["stripe_settlement", "signed_callbacks", "marketing_repair", "retention"]) });
    expect(f.fetcher.mock.calls.every(([url]) => !String(url).includes("api.resend.com") && !String(url).includes("api.vercel.com"))).toBe(true);
    expect(mutations(f.fetcher)).toHaveLength(1);
    expect(String(mutations(f.fetcher)[0][1]?.body)).not.toContain("HELIX_SUPPORT_RETENTION_ENABLED");
  });

  it("rejects unsupported arguments, public targets and arbitrary native SQL before access", async () => {
    expect(() => parseCommand(["apply", "--manifest", "/private/manifest.json"])).toThrow();
    expect(() => parseCommand(["plan", "--manifest", "/private/manifest.json", "--force", "yes"])).toThrow();
    const f = await setup(); (f.manifest as unknown as Record<string, unknown>).origin = "https://another.example";
    await expect(f.run("plan")).rejects.toThrow("invalid_manifest"); expect(f.fetcher).not.toHaveBeenCalled();
  });
});
