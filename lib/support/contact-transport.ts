/** Public, credential-free Contact transport. Runtime browser origin wins over build-time configuration. */
export type UploadBinding = { origin: string; bucket: string };
export const CONTACT_SESSION_MARKER = "helix.support.attempt.v1";
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function contactTransport(origin: string) {
  const production =
    origin === "https://www.helixskin.us" || origin === "https://helixskin.us";
  return {
    production,
    intake: production
      ? "/api/support/production/intake"
      : "/api/support/intake",
    photos: production
      ? "/api/support/production/photos"
      : "/api/support/photos",
  };
}
export function productionCapability() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export function parseUploadBinding(value: unknown): UploadBinding {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("unavailable");
  const v = value as Record<string, unknown>;
  if (
    typeof v.origin !== "string" ||
    !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(v.origin) ||
    typeof v.bucket !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{2,62}$/.test(v.bucket) ||
    ["helix-support-photos", "helix-catalog"].includes(v.bucket)
  )
    throw new Error("unavailable");
  return { origin: v.origin, bucket: v.bucket };
}
export function validateUploadDestination(
  value: unknown,
  binding: UploadBinding,
  inquiryId: string,
  uploadId: string,
) {
  parseUploadBinding(binding);
  if (
    typeof value !== "string" ||
    !UUID.test(inquiryId) ||
    !UUID.test(uploadId)
  )
    throw new Error("unavailable");
  const url = new URL(value);
  if (
    url.origin !== binding.origin ||
    url.pathname !==
      `/storage/v1/object/upload/sign/${binding.bucket}/raw/${inquiryId}/${uploadId}` ||
    url.hash ||
    url.username ||
    url.password ||
    url.searchParams.getAll("token").length !== 1 ||
    !url.searchParams.get("token") ||
    [...url.searchParams.keys()].some((k) => k !== "token")
  )
    throw new Error("unavailable");
  return url.toString();
}
export function validReceipt(
  value: unknown,
  submissionId: string,
): value is { inquiryId: string; submissionId: string; status: "saved" } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.inquiryId === "string" &&
    UUID.test(v.inquiryId) &&
    v.submissionId === submissionId &&
    v.status === "saved"
  );
}
export type Handoff =
  "queued" | "provider_accepted" | "unconfirmed" | "needs_review";
export function handoffMessage(value: Handoff) {
  return value === "provider_accepted"
    ? "The email provider accepted your message. Inbox delivery has not been independently confirmed."
    : value === "unconfirmed"
      ? "Email handoff is not yet confirmed. Your message remains saved."
      : value === "needs_review"
        ? "Email handoff needs review. Your message remains saved."
        : "Your saved message is queued for email handoff.";
}

export function photoHandoffMessage(value: Handoff | "not_ready" | undefined) {
  const prefix = "Photo checked and saved privately; ";
  return value === "provider_accepted"
    ? "Photo checked; email provider accepted it. Inbox delivery is not confirmed."
    : value === "unconfirmed"
      ? `${prefix}email handoff is not yet confirmed.`
      : value === "needs_review"
        ? `${prefix}email handoff needs review.`
        : `${prefix}email handoff is pending.`;
}
