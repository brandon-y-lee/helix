export type EmailEnvironment = Record<string, string | undefined>;

export class EmailConfigurationError extends Error {
  constructor(readonly code: string) { super("Email delivery configuration needs operator attention."); }
}
const value = (env: EmailEnvironment, key: string) => env[key]?.trim() ?? "";
export function isEmailAddress(address: string): boolean {
  return address.length <= 254 && /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(address);
}
export function assertEmailEnvironment(env: EmailEnvironment): void {
  if (value(env, "HELIX_EMAIL_ENVIRONMENT") !== "sandbox" || value(env, "HELIX_EMAIL_MODE") !== "restricted") {
    throw new EmailConfigurationError("restricted_environment_required");
  }
}
export function emailRecipientAllowed(recipient: string, env: EmailEnvironment): boolean {
  if (!isEmailAddress(recipient)) return false;
  const owner = value(env, "HELIX_EMAIL_OWNER_RECIPIENT");
  return (isEmailAddress(owner) && recipient.toLowerCase() === owner.toLowerCase())
    || (value(env, "HELIX_EMAIL_ALLOW_SIMULATORS") === "true"
      && ["delivered@resend.dev", "bounced@resend.dev", "complained@resend.dev", "suppressed@resend.dev"].includes(recipient.toLowerCase()));
}
export function readEmailConfig(env: EmailEnvironment) {
  assertEmailEnvironment(env);
  const siteOrigin = value(env, "HELIX_EMAIL_SITE_ORIGIN");
  let url: URL;
  try { url = new URL(siteOrigin); } catch { throw new EmailConfigurationError("invalid_site_origin"); }
  if (url.origin !== siteOrigin || url.protocol !== "https:" || url.username || url.password) throw new EmailConfigurationError("invalid_site_origin");
  const replyTo = value(env, "HELIX_EMAIL_REPLY_TO");
  if (!isEmailAddress(replyTo)) throw new EmailConfigurationError("invalid_email_identity");
  if (!isEmailAddress(value(env, "HELIX_EMAIL_OWNER_RECIPIENT"))) throw new EmailConfigurationError("verified_owner_recipient_required");
  const apiKey = value(env, "RESEND_API_KEY");
  if (!/^re_[A-Za-z0-9_-]+$/.test(apiKey)) throw new EmailConfigurationError("missing_provider_key");
  return { siteOrigin, replyTo, apiKey };
}

/** Validate a purpose's sender only when preparing a new message of that purpose. */
export function readEmailSender(purpose: "order_confirmation" | "order_tracking", env: EmailEnvironment): string {
  if (purpose !== "order_confirmation" && purpose !== "order_tracking") throw new EmailConfigurationError("unsupported_email_purpose");
  const from = value(env, "HELIX_EMAIL_ORDER_FROM");
  const sender = isEmailAddress(from) ? from : from.match(/^[^<>\r\n]{1,100} <([^<>\s]+)>$/)?.[1];
  if (!sender || !isEmailAddress(sender)) throw new EmailConfigurationError("invalid_email_identity");
  return from;
}
