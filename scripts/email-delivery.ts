import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { assertEmailEnvironment, EmailConfigurationError, readEmailConfig, readEmailSender, type EmailEnvironment } from "../lib/email/config";

const project = "erasogmsqpgiirovubjh";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Input = { command: "inspect" | "retry" | "marketing-status"; id: string | null; expectedUpdatedAt: string | null; apply: boolean };
const importStates = ["admitted", "submitted", "uncertain", "retry_wait", "exhausted", "completed", "failed"] as const;
const failureCategories = ["rate_limited", "quota_exceeded", "configuration_rejected", "provider_unavailable", "provider_contract_invalid"] as const;
const providerErrorNames = ["invalid_idempotency_key", "validation_error", "missing_api_key", "invalid_api_key", "restricted_api_key",
  "suspended_api_key", "invalid_permission", "not_found", "method_not_allowed", "concurrent_idempotent_requests",
  "invalid_idempotent_request", "resource_locked", "invalid_attachment", "invalid_parameter", "missing_required_field",
  "missing_required_parameter", "daily_quota_exceeded", "monthly_quota_exceeded", "rate_limit_exceeded", "application_error",
  "internal_server_error", "service_unavailable"] as const;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const choice = <T extends string>(value: unknown, choices: readonly T[]): value is T => typeof value === "string" && choices.includes(value as T);
const timestamp = (value: unknown): value is string | null => value === null || (typeof value === "string" && value.length <= 40
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)));

function marketingFailure(value: unknown) {
  if (value === null) return null;
  if (!record(value) || !choice(value.category, failureCategories)
    || !(value.httpStatus === null || integer(value.httpStatus, 100, 599))
    || !(value.providerName === null || choice(value.providerName, providerErrorNames))
    || !(value.retryAfterSeconds === null || integer(value.retryAfterSeconds, 0, 86_400))) {
    throw new Error("Marketing inspection is unavailable.");
  }
  return { category: value.category, httpStatus: value.httpStatus, providerName: value.providerName, retryAfterSeconds: value.retryAfterSeconds };
}
function marketingOperation(value: unknown) {
  if (!record(value) || typeof value.subscriberId !== "string" || !uuid.test(value.subscriberId)
    || !integer(value.generation, 1) || !integer(value.currentGeneration, 1) || !integer(value.attemptCount, 1, 3)
    || !choice(value.importState, importStates) || !choice(value.currentConsentStatus, ["pending", "confirmed", "withdrawn"] as const)
    || !timestamp(value.nextSubmissionAt)
    || !(value.providerImportId === null || (typeof value.providerImportId === "string" && uuid.test(value.providerImportId)))) {
    throw new Error("Marketing inspection is unavailable.");
  }
  const firstFailure = marketingFailure(value.firstFailure);
  let remediation: { code: string; action: string };
  switch (value.importState) {
    case "retry_wait": remediation = { code: "wait_for_scheduled_retry", action: "Wait for the worker to retry only while current consent and generation remain eligible." }; break;
    case "exhausted": remediation = { code: "review_exhausted_rejections", action: "Review the recorded rejection. Automatic submissions for this generation have stopped; this command cannot reset them." }; break;
    case "admitted": case "uncertain": remediation = firstFailure?.category === "configuration_rejected"
      ? { code: "review_configuration_and_reconcile", action: "Correct the provider configuration and reconcile the existing import outcome before considering any further action. Do not replay it." }
      : { code: "reconcile_uncertain_import", action: "Reconcile the existing import with provider records. Do not replay an uncertain submission or infer completion from Contact presence." }; break;
    case "submitted": remediation = { code: "await_import_result", action: "Let the worker check the existing provider import. Do not submit another import." }; break;
    case "failed": remediation = { code: "review_failed_import", action: "Review the existing provider import failure. This command cannot reset or replay it." }; break;
    case "completed": remediation = { code: "no_import_action", action: "No import action is needed. Current consent and provider preferences still control email eligibility." }; break;
  }
  return { subscriberId: value.subscriberId, generation: value.generation, importState: value.importState,
    attemptCount: value.attemptCount, nextSubmissionAt: value.nextSubmissionAt, providerImportId: value.providerImportId,
    firstFailure, currentGeneration: value.currentGeneration, currentConsentStatus: value.currentConsentStatus, remediation };
}

export function parseEmailDeliveryCommand(args: string[]): Input {
  const [command, ...options] = args;
  if (command === "marketing-status") {
    if (options.length) throw new Error("Marketing status accepts no options and cannot change delivery state.");
    return { command, id: null, expectedUpdatedAt: null, apply: false };
  }
  if (command !== "inspect" && command !== "retry") throw new Error("Use inspect, retry with an exact message ID, or marketing-status.");
  const values = new Map<string, string>();
  let apply = false;
  for (let index = 0; index < options.length; index++) {
    const key = options[index];
    if (key === "--apply" && !apply) { apply = true; continue; }
    if (!["--id", "--expected-updated-at", "--confirm-project"].includes(key) || values.has(key) || !options[index + 1] || options[index + 1].startsWith("--")) {
      throw new Error("Invalid email delivery command options.");
    }
    values.set(key, options[++index]);
  }
  const id = values.get("--id") ?? null;
  const expectedUpdatedAt = values.get("--expected-updated-at") ?? null;
  if (id && !uuid.test(id)) throw new Error("A valid message ID is required.");
  if (command === "retry" && (!id || !expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt)))) {
    throw new Error("Retry requires --id and the inspected --expected-updated-at value.");
  }
  if (apply && (command !== "retry" || values.get("--confirm-project") !== project)) {
    throw new Error("Apply requires the exact approved non-production project confirmation.");
  }
  return { command, id, expectedUpdatedAt, apply };
}

export async function runEmailDeliveryCommand(args: string[], env: EmailEnvironment = process.env) {
  const input = parseEmailDeliveryCommand(args);
  assertEmailEnvironment(env);
  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${project}.supabase.co` || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("The approved non-production project and server credential are required.");
  }
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (input.command === "marketing-status") {
    const { data, error } = await client.rpc("read_marketing_operations", { p_limit: 20 });
    if (error || !Array.isArray(data) || data.length > 20) throw new Error("Marketing inspection is unavailable.");
    return { project, action: "marketing_status", imports: data.map(marketingOperation) };
  }
  const { data, error } = await client.rpc("inspect_email_deliveries", { p_id: input.id });
  if (error || !Array.isArray(data)) throw new Error("Delivery inspection is unavailable.");
  if (input.command === "inspect") {
    let configuration: { ready: boolean; code?: string } = { ready: true };
    try { readEmailConfig(env); } catch (error) {
      configuration = { ready: false, code: error instanceof EmailConfigurationError ? error.code : "invalid_configuration" };
    }
    let orderSender: { ready: boolean; code?: string } = { ready: true };
    try { readEmailSender("order_confirmation", env); } catch (error) {
      orderSender = { ready: false, code: error instanceof EmailConfigurationError ? error.code : "invalid_configuration" };
    }
    return { project, configuration, orderSender, dispatchEnabled: env.HELIX_EMAIL_DISPATCH_ENABLED === "true", deliveries: data };
  }
  const current = data.find((row: { id: string }) => row.id === input.id);
  if (!current || current.updatedAt !== input.expectedUpdatedAt) throw new Error("Delivery changed; inspect it again before retrying.");
  if (!input.apply) return { project, action: "retry_plan", messageId: input.id, expectedUpdatedAt: input.expectedUpdatedAt, note: "No work changed. Apply only after investigating the delivery state." };
  const retry = await client.rpc("retry_email_delivery", { p_id: input.id, p_expected_updated_at: input.expectedUpdatedAt });
  if (retry.error || retry.data !== true) throw new Error("Delivery cannot be retried safely. Inspect and reconcile its existing provider attempt.");
  return { project, action: "retry_queued", messageId: input.id };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runEmailDeliveryCommand(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch(() => {
    console.error("Email delivery command failed. Verify its arguments, private configuration, and inspected delivery state.");
    process.exitCode = 1;
  });
}
