import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { assertEmailEnvironment, EmailConfigurationError, readEmailConfig, readEmailSender, type EmailEnvironment } from "../lib/email/config";

const project = "erasogmsqpgiirovubjh";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Input = { command: "inspect" | "retry"; id: string | null; expectedUpdatedAt: string | null; apply: boolean };

export function parseEmailDeliveryCommand(args: string[]): Input {
  const [command, ...options] = args;
  if (command !== "inspect" && command !== "retry") throw new Error("Use inspect or retry with an exact message ID.");
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
