import { createHash } from "node:crypto";
import { assertEmailEnvironment, emailRecipientAllowed, isEmailAddress, type EmailEnvironment } from "../../lib/email/config";

const project = "erasogmsqpgiirovubjh";
const proofRequired = [
  "provider_recipient_restriction", "auth_link_tracking_disabled",
  "secure_email_change_recipient_restriction", "existing_account_continuity", "recoverable_prior_smtp_credentials",
];
const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

export async function runAuthEmailCommand(args: string[], env: EmailEnvironment, buildTemplates: (origin: string) => Record<string, string>, fetcher: typeof fetch = fetch) {
  const expectedFingerprint = args[0] === "verify" && args.length === 3 && args[1] === "--expected-fingerprint" && /^[a-f0-9]{64}$/.test(args[2]) ? args[2] : null;
  if ((args.length !== 1 && !expectedFingerprint) || !["plan", "verify"].includes(args[0])) throw new Error("Use plan or verify; this command cannot activate SMTP.");
  assertEmailEnvironment(env);
  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${project}.supabase.co`) throw new Error("The approved non-production project is required.");
  const origin = env.HELIX_EMAIL_SITE_ORIGIN ?? "";
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error("A valid HTTPS site origin is required."); }
  if (url.origin !== origin || url.protocol !== "https:" || url.username || url.password) throw new Error("A valid HTTPS site origin is required.");
  if (env.HELIX_EMAIL_AUTH_FROM !== "onboarding@resend.dev") throw new Error("The restricted Auth sender is required.");
  const owner = env.HELIX_EMAIL_OWNER_RECIPIENT ?? "";
  if (!isEmailAddress(owner) || !emailRecipientAllowed(owner, env)) throw new Error("An allowed owner recipient is required.");
  if (!["true", "false"].includes(env.HELIX_EMAIL_ALLOW_SIMULATORS ?? "")) throw new Error("An explicit simulator recipient policy is required.");
  const templates = buildTemplates(origin);
  const report = {
    command: args[0], project, activationReady: false,
    target: { site_url: origin, smtp_host: "smtp.resend.com", smtp_port: "465", smtp_user: "resend", smtp_admin_email: "onboarding@resend.dev", smtp_sender_name: "Helix" },
    templateHashes: Object.fromEntries(Object.entries(templates).map(([key, value]) => [key, hash(value)])),
    recipientPolicy: { owner: "configured", simulators: env.HELIX_EMAIL_ALLOW_SIMULATORS === "true" },
    operationalProofRequired: proofRequired,
    configurationMatches: null as boolean | null, changedFields: [] as string[], findings: [] as string[], observedFingerprint: null as string | null,
  };
  if (args[0] === "plan") return report;
  const credential = env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!credential) throw new Error("A private Management API credential is required for verification.");
  let current: Record<string, unknown>;
  try {
    const response = await fetcher(`https://api.supabase.com/v1/projects/${project}/config/auth`, {
      method: "GET", headers: { Authorization: `Bearer ${credential}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("unavailable");
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid_response");
    current = data as Record<string, unknown>;
  } catch { throw new Error("Auth configuration is unavailable; no provider details were retained."); }
  const changedFields = Object.entries({ ...report.target, ...templates }).filter(([key, desired]) => current[key] !== desired).map(([key]) => key);
  const findings: string[] = [];
  if (current.hook_send_email_enabled === true) findings.push("conflicting_send_email_hook");
  else if (current.hook_send_email_enabled !== false) findings.push("send_email_hook_unverified");
  if (current.external_email_enabled !== true) findings.push("email_auth_not_enabled");
  if (current.mailer_autoconfirm !== false) findings.push("email_confirmation_not_enabled");
  if (current.mailer_secure_email_change_enabled !== true) findings.push("secure_email_change_not_enabled");
  const observed = Object.entries(current).filter(([key]) =>
    /^(smtp_|mailer_|hook_send_email_|rate_limit_|site_url$|uri_allow_list$|external_email_enabled$|disable_signup$)/.test(key)
    && key !== "smtp_pass" && !key.endsWith("_secrets")
  ).sort(([left], [right]) => left.localeCompare(right));
  const observedFingerprint = hash(observed);
  if (expectedFingerprint && expectedFingerprint !== observedFingerprint) throw new Error("Auth configuration changed; review a fresh observation before activation.");
  return { ...report, changedFields, findings, observedFingerprint, configurationMatches: changedFields.length === 0 && findings.length === 0 };
}
