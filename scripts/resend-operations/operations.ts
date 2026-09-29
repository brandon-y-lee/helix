import { createHash } from "node:crypto";
import { buildAuthEmailTemplates } from "../../lib/email/auth-templates";
import { assertEmailEnvironment, isEmailAddress, type EmailEnvironment } from "../../lib/email/config";
import { runAuthEmailCommand } from "../auth-email/operations";

export const TARGET = { project: "erasogmsqpgiirovubjh", team: "team_uriJjJWNwpZnZHnIp5AiXuv0",
  vercelProject: "prj_N9nyPL9SixJHOROIovS8PDQ9aKny", origin: "https://helixskin.vercel.app" } as const;
export const WEBHOOK_EVENTS = ["email.bounced", "email.complained", "email.delivered", "email.delivery_delayed", "email.failed", "email.received", "email.sent", "email.suppressed"];
export const CONTROL_READS = { confirmation: "read_order_confirmation_email_control", tracking: "read_simulated_tracking_control",
  support: "read_support_intake_control", receiving: "read_support_receiving_control", marketing: "read_marketing_email_control",
  product: "read_product_notification_email_control" } as const;
export const PROOF_KINDS = ["provider-account-and-credentials", "owner-and-simulator-restriction", "auth-continuity-and-rollback",
  "auth-and-capability-tracking-disabled", "receiving-and-provider-retention", "native-campaigns-disabled", "hosting-and-linux-photos"] as const;
const purposes = ["marketing_confirmation", "welcome_initial", "welcome_education"] as const;
const sha = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : record(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
export const fingerprint = (v: unknown) => createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
const same = (a: unknown, b: unknown) => fingerprint(a) === fingerprint(b);
class OperationsError extends Error { constructor(readonly code: string) { super(`Resend operations: ${code}. No provider details were retained.`); } }
function fail(code: string): never { throw new OperationsError(code); }
const text = (v: unknown, max = 200): v is string => typeof v === "string" && !!v.trim() && v.length <= max && !/[\r\n]/.test(v);
const exactKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));

export const SCHEDULES = [
  { name: "helix-email-dispatch", path: "/api/internal/email-dispatch", secret: "HELIX_EMAIL_DISPATCH_SECRET" },
  { name: "helix-marketing-sync", path: "/api/internal/marketing-sync", secret: "HELIX_EMAIL_DISPATCH_SECRET" },
  { name: "helix-support-ingest", path: "/api/internal/support-ingest", secret: "HELIX_SUPPORT_INGEST_SECRET" },
  { name: "helix-support-retention", path: "/api/internal/support-retention", secret: "HELIX_SUPPORT_RETENTION_SECRET" },
].map(job => ({ ...job, schedule: "* * * * *", command: `select net.http_post(url := '${TARGET.origin}${job.path}', headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${job.secret}')), body := '{}'::jsonb, timeout_milliseconds := 55000);` }));

export type Manifest = {
  version: 1; codeSha: string; project: typeof TARGET.project; origin: typeof TARGET.origin;
  ownerRecipient: string; allowSimulators: boolean; receivingAddress: string; photoBucket: string;
  postalAddress: string; topicName: string;
  templates: Record<typeof purposes[number], { alias: string; contentSha256: string }>;
  migrations: { file: string; sha256: string }[];
  credentialVersions: Record<string, { version: string; sha256: string } | { version: string; generated: true }>;
  setupReceiptFile: string;
  evidence: Record<typeof PROOF_KINDS[number], { file: string; sha256: string | null }>;
  smtp: { change: boolean; beforeFingerprint: string; rollbackReference: string };
  expectedControlsFingerprint: string | null;
  enable: Record<keyof typeof CONTROL_READS, boolean>;
};
export type SetupReceipt = { manifestSha256: string; codeSha: string; controlsFingerprint: string;
  credentials: Record<string, { version: string; sha256: string }>; evidence: Record<string, string>;
  environment?: Record<string, { id: string; updatedAt: number }>;
  smtpApplied?: { fingerprint: string; credentialVersion: string }; controlsAppliedFingerprint?: string };
export type LocalEvidence = { codeSha: string; clean: boolean; migrations: Record<string, string>; evidence: Record<string, string>; setupReceipt?: unknown };
export function parseManifest(value: unknown): Manifest {
  if (!record(value) || !exactKeys(value, ["version", "codeSha", "project", "origin", "ownerRecipient", "allowSimulators", "receivingAddress", "photoBucket",
    "postalAddress", "topicName", "templates", "migrations", "credentialVersions", "setupReceiptFile", "evidence", "smtp", "expectedControlsFingerprint", "enable"])
    || value.version !== 1 || value.project !== TARGET.project || value.origin !== TARGET.origin || typeof value.codeSha !== "string" || !/^[a-f0-9]{40}$/.test(value.codeSha)
    || !text(value.ownerRecipient, 254) || !isEmailAddress(value.ownerRecipient) || typeof value.allowSimulators !== "boolean"
    || !text(value.receivingAddress, 254) || !isEmailAddress(value.receivingAddress) || !/^[^@]+@[a-z0-9-]+\.resend\.app$/.test(value.receivingAddress)
    || !text(value.photoBucket, 63) || !/^[a-z0-9][a-z0-9_-]{2,62}$/.test(value.photoBucket)
    || !text(value.postalAddress, 500) || /[<>]/.test(value.postalAddress) || !text(value.topicName, 100)
    || !record(value.templates) || !exactKeys(value.templates, [...purposes]) || !Array.isArray(value.migrations) || !value.migrations.length || value.migrations.length > 20
    || !record(value.credentialVersions) || !Object.keys(value.credentialVersions).length || !Object.entries(value.credentialVersions).every(([k, v]) => /^[A-Z][A-Z0-9_]+$/.test(k) && record(v) && text(v.version)
      && ((exactKeys(v, ["version", "sha256"]) && typeof v.sha256 === "string" && sha.test(v.sha256)) || (exactKeys(v, ["version", "generated"]) && v.generated === true)))
    || !text(value.setupReceiptFile, 500) || !value.setupReceiptFile.startsWith("/")
    || !record(value.evidence) || !exactKeys(value.evidence, [...PROOF_KINDS]) || !record(value.smtp) || !exactKeys(value.smtp, ["change", "beforeFingerprint", "rollbackReference"])
    || typeof value.smtp.change !== "boolean" || typeof value.smtp.beforeFingerprint !== "string" || !sha.test(value.smtp.beforeFingerprint) || !text(value.smtp.rollbackReference, 500)
    || (value.expectedControlsFingerprint !== null && (typeof value.expectedControlsFingerprint !== "string" || !sha.test(value.expectedControlsFingerprint)))
    || !record(value.enable) || !exactKeys(value.enable, Object.keys(CONTROL_READS)) || !Object.values(value.enable).every(v => typeof v === "boolean")) fail("invalid_manifest");
  const aliases: string[] = [];
  for (const p of purposes) {
    const t = value.templates[p];
    if (!record(t) || !exactKeys(t, ["alias", "contentSha256"]) || !text(t.alias) || !/^helix-r1-[a-z0-9-]+$/.test(t.alias)
      || typeof t.contentSha256 !== "string" || !sha.test(t.contentSha256)) fail("invalid_template_manifest");
    aliases.push(t.alias);
  }
  if (new Set(aliases).size !== 3) fail("duplicate_template_alias");
  const files: string[] = [];
  for (const migration of value.migrations) {
    if (!record(migration) || !exactKeys(migration, ["file", "sha256"]) || typeof migration.file !== "string"
      || !/^20260929\d{6}_[a-z0-9_]+\.sql$/.test(migration.file) || typeof migration.sha256 !== "string" || !sha.test(migration.sha256)) fail("invalid_migration_manifest");
    files.push(migration.file);
  }
  if (new Set(files).size !== files.length || !same(files, [...files].sort())) fail("invalid_migration_order");
  for (const evidence of Object.values(value.evidence)) {
    if (!record(evidence) || !exactKeys(evidence, ["file", "sha256"]) || !text(evidence.file, 500) || !evidence.file.startsWith("/")
      || (evidence.sha256 !== null && (typeof evidence.sha256 !== "string" || !sha.test(evidence.sha256)))) fail("invalid_evidence_reference");
  }
  return value as Manifest;
}

export function parseCommand(args: string[]) {
  const [command, ...rest] = args;
  if (!["plan", "verify", "apply", "disable"].includes(command)) fail("invalid_command");
  const options = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    if (!["--manifest", "--confirm"].includes(rest[i]) || options.has(rest[i]) || !rest[i + 1] || rest[i + 1].startsWith("--")) fail("invalid_arguments");
    options.set(rest[i], rest[i + 1]);
  }
  if (!options.get("--manifest") || ((command === "apply" || command === "disable")
    ? !sha.test(options.get("--confirm") ?? "") : options.has("--confirm"))) fail("manifest_confirmation_required");
  return { command: command as "plan" | "verify" | "apply" | "disable", path: options.get("--manifest")!, confirmation: options.get("--confirm") };
}

/** Content hash excludes provider-generated IDs/version IDs, so setup can be approved before creation. */
export function templateContentFingerprint(v: Record<string, unknown>) {
  return fingerprint({ subject: v.subject, html: v.html, text: v.text, from: v.from, reply_to: v.reply_to });
}
function templateRuntimeFingerprint(v: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify({ id: v.id, version: v.current_version_id, subject: v.subject,
    html: v.html, text: v.text, from: v.from, replyTo: v.reply_to })).digest("hex");
}
const literal = (v: unknown) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
const readControlsSql = `jsonb_build_object(${Object.entries(CONTROL_READS).map(([k, fn]) => `'${k}', public.${fn}()`).join(", ")})`;
function controlEnabled(value: unknown): boolean | null {
  const rows = Array.isArray(value) ? value : [value];
  if (!rows.length || !rows.every(v => record(v) && typeof v.enabled === "boolean" && text(v.updatedAt))) return null;
  const enabled = rows.map(v => (v as Record<string, unknown>).enabled);
  return enabled.every(v => v === true) ? true : enabled.every(v => v === false) ? false : null;
}

/** Fixed transaction, existing CAS functions, one lock order. No manifest-supplied SQL is accepted. */
export function controlChangeSql(before: Record<string, unknown>, desired: Manifest["enable"]) {
  return `begin;
set local lock_timeout = '5s';
set local statement_timeout = '10s';
do $helix$
declare before_state jsonb;
begin
  perform 1 from private.email_controls where environment='sandbox' order by purpose for update;
  perform 1 from private.support_controls where environment='sandbox' for update;
  before_state := ${readControlsSql};
  if before_state is distinct from ${literal(before)} then raise exception 'activation_control_drift'; end if;
${Object.entries(desired).filter(([k, enabled]) => controlEnabled(before[k]) !== enabled).map(([k, enabled]) => {
    const key = k as keyof typeof CONTROL_READS;
    const read = `public.${CONTROL_READS[key]}()`;
    const scalar = `((${read})->>'updatedAt')::timestamptz`;
    const map = `(select jsonb_object_agg(v->>'purpose',v->'updatedAt') from jsonb_array_elements(${read}) v)`;
    const call = key === "confirmation" ? `public.configure_order_confirmation_email(${enabled},((${read})->>'acceptedAfter')::timestamptz,${scalar})`
      : key === "tracking" ? `public.configure_simulated_tracking(${enabled},${scalar})`
      : key === "support" ? `public.configure_support_intake(${enabled},${scalar})`
      : key === "receiving" ? `public.configure_support_receiving(${enabled},${scalar})`
      : key === "marketing" ? `public.configure_marketing_email(${enabled},${map})`
      : `public.configure_product_notification_email(${enabled},${map})`;
    return `  if not ${call} then raise exception 'activation_control_conflict'; end if;`;
  }).join("\n")}
end $helix$;
commit;`;
}

export async function runResendOperations(command: ReturnType<typeof parseCommand>["command"], rawManifest: string,
  env: EmailEnvironment, local: LocalEvidence, fetcher: typeof fetch = fetch, confirmation?: string) {
  const manifest = parseManifest(JSON.parse(rawManifest));
  const manifestSha256 = createHash("sha256").update(rawManifest).digest("hex");
  if ((command === "apply" || command === "disable") && confirmation !== manifestSha256) fail("manifest_confirmation_mismatch");
  assertEmailEnvironment(env);
  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${TARGET.project}.supabase.co`) fail("project_mismatch");
  const receiptValue = local.setupReceipt;
  const receipt = record(receiptValue) && receiptValue.manifestSha256 === manifestSha256 && receiptValue.codeSha === manifest.codeSha
    && record(receiptValue.credentials) && record(receiptValue.evidence) && typeof receiptValue.controlsFingerprint === "string" && sha.test(receiptValue.controlsFingerprint)
    ? receiptValue as SetupReceipt : null;
  const findings: string[] = [];
  const observations: Record<string, unknown> = {};
  const add = (code: string) => { if (!findings.includes(code)) findings.push(code); };
  const required = (key: string) => { const value = env[key]?.trim(); if (!value) fail(`missing_${key.toLowerCase()}`); return value; };
  async function request(url: string, token: string, method = "GET", body?: unknown, headers: Record<string, string> = {}): Promise<unknown> {
    try {
      const response = await fetcher(url, { method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (!response.ok) { await response.body?.cancel(); fail(`provider_http_${response.status}`); }
      if (response.status === 204) return null;
      const reader = response.body?.getReader(); if (!reader) fail("provider_empty_response");
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length;
        if (size > 2_000_000) { await reader.cancel(); fail("provider_response_too_large"); } chunks.push(next.value); }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) { if (error instanceof OperationsError) throw error; fail("provider_read_or_write_failed"); }
  }
  const supabase = (path: string, method = "GET", body?: unknown) => request(`https://api.supabase.com/v1/projects/${TARGET.project}${path}`, required("SUPABASE_ACCESS_TOKEN"), method, body);
  const rpc = (name: string) => request(`https://${TARGET.project}.supabase.co/rest/v1/rpc/${name}`, required("SUPABASE_SERVICE_ROLE_KEY"), "POST", {}, { apikey: required("SUPABASE_SERVICE_ROLE_KEY") });
  const resend = (path: string) => request(`https://api.resend.com${path}`, required("RESEND_API_KEY"));
  const vercel = (path: string) => request(`https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${TARGET.team}`, required("VERCEL_ACCESS_TOKEN"));
  const controls: Record<string, unknown> = {};
  async function inspect(label: string, read: () => Promise<void>) { try { await read(); } catch (error) { add(`${label}_${error instanceof OperationsError && error.code === "provider_http_404" ? "missing" : "read_failed"}`); } }
  await inspect("project", async () => { const p = await supabase(""); if (!record(p) || (p.id !== TARGET.project && p.ref !== TARGET.project) || p.status !== "ACTIVE_HEALTHY") fail("project_unavailable"); });
  for (const [key, fn] of Object.entries(CONTROL_READS)) await inspect(`control_${key}`, async () => {
    const value = await rpc(fn); if (controlEnabled(value) === null) fail("invalid_control"); controls[key] = value;
  });
  if (Object.keys(controls).length === 6) observations.controlsFingerprint = fingerprint(controls);
  if (local.codeSha !== manifest.codeSha || !local.clean) add("reviewed_clean_source_required");
  const allOff = Object.fromEntries(Object.keys(CONTROL_READS).map(k => [k, false])) as Manifest["enable"];
  if (command === "disable") {
    // Recovery must remain usable during an email/hosting outage; only the fixed project and fresh CAS state are needed.
    if (findings.some(v => v === "project_read_failed" || v.startsWith("control_"))) fail("disable_preflight_failed");
    await supabase("/database/query", "POST", { query: controlChangeSql(controls, allOff), read_only: false });
    for (const fn of Object.values(CONTROL_READS)) if (controlEnabled(await rpc(fn)) !== false) fail("disable_postflight_failed");
    return { command, manifestSha256, admissionDisabled: true, dispatchPauseRequired: true,
      preserved: ["stripe_settlement", "signed_callbacks", "accepted_support", "marketing_repair", "retention"], findings: [] };
  }
  if (!manifest.migrations.every(m => local.migrations[m.file] === m.sha256)) add("migration_source_drift");
  if (!PROOF_KINDS.every(kind => {
    const expected = manifest.evidence[kind].sha256 ?? receipt?.evidence[kind];
    return typeof expected === "string" && sha.test(expected) && local.evidence[manifest.evidence[kind].file] === expected;
  })) add("private_evidence_missing_or_changed");
  const requiredVersions = ["RESEND_API_KEY", "RESEND_RECEIVING_API_KEY", "RESEND_WEBHOOK_SECRET", "HELIX_EMAIL_DISPATCH_SECRET",
    "HELIX_SUPPORT_INGEST_SECRET", "HELIX_SUPPORT_RETENTION_SECRET", "HELIX_SUPPORT_PHOTO_ACCESS_SECRET", "HELIX_SUPPORT_AI_WORKER_SECRET"];
  if (requiredVersions.some(k => !manifest.credentialVersions[k])) add("credential_versions_incomplete");
  if (requiredVersions.some(k => {
    const planned = manifest.credentialVersions[k];
    const bound = planned && "generated" in planned ? receipt?.credentials[k] : planned;
    return !planned || !bound || bound.version !== planned.version || typeof bound.sha256 !== "string" || !sha.test(bound.sha256)
      || !env[k] || createHash("sha256").update(env[k]!).digest("hex") !== bound.sha256;
  })) add("credential_receipt_missing_or_value_drift");
  const expectedEnvironment: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: `https://${TARGET.project}.supabase.co`, HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted",
    HELIX_EMAIL_SITE_ORIGIN: TARGET.origin, HELIX_EMAIL_OWNER_RECIPIENT: manifest.ownerRecipient, HELIX_EMAIL_ALLOW_SIMULATORS: String(manifest.allowSimulators),
    HELIX_EMAIL_ORDER_FROM: "Helix <onboarding@resend.dev>", HELIX_EMAIL_SUPPORT_FROM: "Helix <onboarding@resend.dev>",
    HELIX_EMAIL_PRODUCT_FROM: "Helix <onboarding@resend.dev>", HELIX_EMAIL_AUTH_FROM: "onboarding@resend.dev",
    HELIX_EMAIL_REPLY_TO: manifest.receivingAddress, HELIX_SUPPORT_RECEIVING_ADDRESS: manifest.receivingAddress, HELIX_SUPPORT_PHOTO_BUCKET: manifest.photoBucket,
  };
  if (Object.entries(expectedEnvironment).some(([k, v]) => env[k] !== v)) add("private_configuration_mismatch");
  let deploymentCreatedAt = 0;
  await inspect("deployment", async () => {
    const alias = await vercel(`/v4/aliases/${new URL(TARGET.origin).hostname}`);
    if (!record(alias) || !record(alias.deployment) || !text(alias.deployment.id)) fail("deployment_alias_missing");
    const d = await vercel(`/v13/deployments/${encodeURIComponent(alias.deployment.id)}`);
    if (!record(d) || d.projectId !== TARGET.vercelProject || d.readyState !== "READY" || d.target === "production"
      || !record(d.meta) || d.meta.githubCommitRef !== "dev" || d.meta.githubCommitSha !== manifest.codeSha || typeof d.createdAt !== "number") fail("deployment_mismatch");
    deploymentCreatedAt = d.createdAt; observations.deploymentId = d.id; observations.deploymentSha = manifest.codeSha;
  });
  const generatedTemplates: Record<string, { id: string; sha256: string }> = {};
  let topicId = "";
  await inspect("topic", async () => {
    const result = await resend("/topics");
    if (!record(result) || !Array.isArray(result.data) || result.has_more === true) fail("topic_inventory_incomplete");
    const matches = result.data.filter(v => record(v) && v.name === manifest.topicName);
    if (matches.length !== 1 || !record(matches[0]) || typeof matches[0].id !== "string" || !uuid.test(matches[0].id)
      || matches[0].default_subscription !== "opt_in") { add("topic_missing_or_mismatched"); return; }
    topicId = matches[0].id; observations.topicId = topicId;
  });
  for (const p of purposes) await inspect(`template_${p}`, async () => {
    const t = await resend(`/templates/${encodeURIComponent(manifest.templates[p].alias)}`);
    if (!record(t) || typeof t.id !== "string" || !uuid.test(t.id) || typeof t.current_version_id !== "string" || !uuid.test(t.current_version_id)
      || t.status !== "published" || t.has_unpublished_versions !== false || t.alias !== manifest.templates[p].alias
      || typeof t.subject !== "string" || typeof t.html !== "string" || typeof t.text !== "string"
      || !same(templateContentFingerprint(t), manifest.templates[p].contentSha256)) { add(`template_${p}_mismatched`); return; }
    generatedTemplates[p] = { id: t.id, sha256: templateRuntimeFingerprint(t) };
  });
  await inspect("webhook", async () => {
    const list = await resend("/webhooks");
    if (!record(list) || !Array.isArray(list.data) || list.has_more === true) fail("webhook_inventory_incomplete");
    const matches = list.data.filter(v => record(v) && v.endpoint === `${TARGET.origin}/api/webhooks/resend`);
    if (matches.length !== 1 || !record(matches[0]) || !text(matches[0].id)) { add("webhook_missing_or_ambiguous"); return; }
    const webhook = await resend(`/webhooks/${encodeURIComponent(matches[0].id)}`);
    if (!record(webhook) || webhook.endpoint !== `${TARGET.origin}/api/webhooks/resend` || webhook.status !== "enabled"
      || !Array.isArray(webhook.events) || !same([...webhook.events].sort(), WEBHOOK_EVENTS)
      || webhook.signing_secret !== env.RESEND_WEBHOOK_SECRET) { add("webhook_configuration_mismatch"); return; }
    observations.webhookId = webhook.id;
  });
  await inspect("bucket", async () => {
    const bucket = await request(`https://${TARGET.project}.supabase.co/storage/v1/bucket/${encodeURIComponent(manifest.photoBucket)}`, required("SUPABASE_SERVICE_ROLE_KEY"), "GET", undefined, { apikey: required("SUPABASE_SERVICE_ROLE_KEY") });
    if (!record(bucket) || bucket.name !== manifest.photoBucket || bucket.public !== false || bucket.file_size_limit !== 10485760
      || !Array.isArray(bucket.allowed_mime_types) || !same([...bucket.allowed_mime_types].sort(), ["image/jpeg", "image/png", "image/webp"])) add("private_bucket_mismatch");
  });
  await inspect("database_setup", async () => {
    const value = await supabase("/database/query/read-only", "POST", { query: `select jsonb_build_object('migrations', (select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from supabase_migrations.schema_migrations), 'cron', to_regclass('cron.job') is not null) as state;` });
    if (!Array.isArray(value) || !record(value[0]) || !record(value[0].state) || !Array.isArray(value[0].state.migrations)) fail("migration_inventory_unavailable");
    if (!manifest.migrations.every(m => (value[0] as {state:{migrations:unknown[]}}).state.migrations.includes(m.file.slice(0, 14)))) add("migrations_missing");
    if (value[0].state.cron !== true) { add("schedules_missing"); return; }
    const rows = await supabase("/database/query/read-only", "POST", { query: `select jobname, schedule, command, active from cron.job where jobname in ('helix-email-dispatch','helix-marketing-sync','helix-support-ingest','helix-support-retention') order by jobname;` });
    if (!Array.isArray(rows)) fail("schedule_inventory_unavailable");
    if (rows.length !== 4 || SCHEDULES.some(job => rows.filter(row => record(row) && row.jobname === job.name && row.schedule === job.schedule
      && typeof row.command === "string" && row.command.trim() === job.command && row.active === true).length !== 1)) add("schedules_mismatched");
  });
  if (topicId && Object.keys(generatedTemplates).length === 3) {
    const contract = { version: "welcome_v1", siteOrigin: TARGET.origin, from: "Helix <onboarding@resend.dev>", replyTo: manifest.receivingAddress,
      postalAddress: manifest.postalAddress, topicId, templates: generatedTemplates };
    try { if (!same(JSON.parse(env.HELIX_EMAIL_MARKETING_CONTRACT ?? ""), contract)) add("marketing_contract_mismatch"); }
    catch { add("marketing_contract_mismatch"); }
    expectedEnvironment.HELIX_EMAIL_MARKETING_CONTRACT = JSON.stringify(contract);
    observations.templateBindings = generatedTemplates;
  }
  await inspect("hosted_configuration", async () => {
    const result = await vercel(`/v9/projects/${TARGET.vercelProject}/env?decrypt=true&gitBranch=dev&limit=100`);
    if (!record(result) || !Array.isArray(result.envs) || (record(result.pagination) && result.pagination.next != null)) fail("environment_inventory_incomplete");
    const scoped = result.envs.filter(v => record(v) && Array.isArray(v.target) && v.target.includes("preview") && (v.gitBranch === "dev" || !v.gitBranch));
    for (const [key, wanted] of Object.entries({ ...expectedEnvironment, ...Object.fromEntries(requiredVersions.map(key => [key, required(key)])) })) {
      const branch = scoped.filter(v => record(v) && v.key === key && v.gitBranch === "dev");
      const found = branch.length ? branch : scoped.filter(v => record(v) && v.key === key && !v.gitBranch);
      if (found.length !== 1 || !record(found[0]) || typeof found[0].updatedAt !== "number" || found[0].updatedAt > deploymentCreatedAt) {
        add("hosted_environment_mismatch"); continue;
      }
      const variable = found[0], bound = receipt?.environment?.[key];
      if (variable.type === "sensitive") {
        // Sensitive values cannot be recovered. The approved setup receipt binds the applied variable revision; hosted rehearsal proves actual use.
        if (!bound || variable.id !== bound.id || variable.updatedAt !== bound.updatedAt) add("hosted_sensitive_revision_unbound");
      } else if (typeof variable.value !== "string"
        || (key === "HELIX_EMAIL_MARKETING_CONTRACT" ? !same(JSON.parse(variable.value), JSON.parse(wanted)) : variable.value !== wanted)) add("hosted_environment_mismatch");
    }
    for (const key of ["HELIX_MARKETING_SYNC_ENABLED", "HELIX_SUPPORT_RETENTION_ENABLED"]) {
      const found = scoped.filter(v => record(v) && v.key === key && v.gitBranch === "dev");
      if (found.length !== 1 || !record(found[0]) || found[0].value !== "true") add("repair_workers_disabled");
    }
  });
  async function readAuth() {
    const configuration = await supabase("/config/auth");
    if (!record(configuration)) fail("invalid_auth_response");
    const report = await runAuthEmailCommand(["verify"], env, buildAuthEmailTemplates,
      async () => new Response(JSON.stringify(configuration)));
    return { configuration, report };
  }
  await inspect("smtp", async () => {
    const { report: auth } = await readAuth();
    observations.smtpFingerprint = auth.observedFingerprint;
    if (auth.findings.length) add("smtp_security_configuration_mismatch");
    if (auth.changedFields.includes("site_url")) add("smtp_site_origin_mismatch");
    if (!auth.configurationMatches && !manifest.smtp.change) add("smtp_configuration_mismatch");
    const applied = receipt?.smtpApplied;
    const previousApply = manifest.smtp.change && auth.configurationMatches && applied?.fingerprint === auth.observedFingerprint
      && applied.credentialVersion === manifest.credentialVersions.RESEND_API_KEY?.version;
    if (auth.observedFingerprint !== manifest.smtp.beforeFingerprint && !previousApply) add("smtp_baseline_drift");
  });
  const desiredMatches = Object.entries(manifest.enable).every(([key, enabled]) => controlEnabled(controls[key]) === enabled);
  const expectedControls = manifest.expectedControlsFingerprint ?? receipt?.controlsFingerprint;
  const baselineMatches = observations.controlsFingerprint === expectedControls
    && (manifest.expectedControlsFingerprint !== null || Object.values(controls).every(v => controlEnabled(v) === false));
  const appliedFingerprint = receipt?.controlsAppliedFingerprint;
  const recordedApplyMatches = desiredMatches && typeof appliedFingerprint === "string" && sha.test(appliedFingerprint)
    && observations.controlsFingerprint === appliedFingerprint;
  if (!baselineMatches && !recordedApplyMatches) add("control_baseline_drift");
  const report = { command, manifestSha256, codeSha: manifest.codeSha, readyForGuardedApply: findings.length === 0,
    operationalAcceptanceComplete: false, findings, observations, requiredEvidence: PROOF_KINDS,
    intended: { webhook: { endpoint: `${TARGET.origin}/api/webhooks/resend`, events: WEBHOOK_EVENTS },
      schedules: SCHEDULES, controls: manifest.enable, smtpChange: manifest.smtp.change, migrationFiles: manifest.migrations.map(m => m.file) } };
  if (command !== "apply") return report;
  if (findings.length) fail("activation_preflight_failed");
  // Repeat the mutable Auth and control observations immediately before the bounded writes.
  const fresh = await readAuth(), freshAuth = fresh.report;
  if (freshAuth.observedFingerprint !== observations.smtpFingerprint) fail("smtp_changed_during_preflight");
  if (manifest.smtp.change) {
    const patch = { ...buildAuthEmailTemplates(TARGET.origin), smtp_host: "smtp.resend.com", smtp_port: "465",
      smtp_user: "resend", smtp_pass: required("RESEND_API_KEY"), smtp_admin_email: "onboarding@resend.dev", smtp_sender_name: "Helix" };
    await supabase("/config/auth", "PATCH", patch);
    const after = await readAuth();
    const preserved = (configuration: Record<string, unknown>) => Object.fromEntries(Object.entries(configuration).filter(([key]) =>
      !Object.hasOwn(patch, key) && /^(smtp_|mailer_|hook_send_email_|rate_limit_|site_url$|uri_allow_list$|external_email_enabled$|disable_signup$)/.test(key)));
    if (!after.report.configurationMatches || !same(preserved(fresh.configuration), preserved(after.configuration))) fail("smtp_postflight_failed_admission_unchanged");
    observations.smtpFingerprint = after.report.observedFingerprint;
  }
  if (!desiredMatches) await supabase("/database/query", "POST", { query: controlChangeSql(controls, manifest.enable), read_only: false });
  const after: Record<string, unknown> = {};
  for (const [key, fn] of Object.entries(CONTROL_READS)) after[key] = await rpc(fn);
  if (!Object.entries(manifest.enable).every(([key, enabled]) => controlEnabled(after[key]) === enabled)
    || (desiredMatches && fingerprint(after) !== observations.controlsFingerprint)) fail("control_postflight_failed");
  return { ...report, applied: true, observations: { ...observations, controlsFingerprint: fingerprint(after) },
    note: "Admission controls are configured. Hosted flags, mailbox receipt and the acceptance runbook remain separate evidence." };
}
