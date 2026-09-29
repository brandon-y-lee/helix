import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { UUID } from "@/lib/marketing/contract";
import type { MarketingRequestStorage } from "@/lib/marketing/requests";
import type { MarketingServiceStorage, MarketingSyncJob, MarketingSendContext, MarketingImportAdmission, MarketingImportJob } from "@/lib/marketing/service";

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createSupabaseAdminClient().rpc(name, args);
  if (error) throw new Error("Email preferences are temporarily unavailable.");
  return data;
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function status(value: unknown): { status: string } {
  if (!record(value) || typeof value.status !== "string") throw new Error("Invalid email preference result.");
  return { status: value.status };
}
function validIdentity(value: unknown): value is Record<string, unknown> {
  return record(value) && typeof value.subscriberId === "string" && UUID.test(value.subscriberId)
    && typeof value.email === "string" && Number.isSafeInteger(value.generation) && Number(value.generation) > 0
    && Number.isSafeInteger(value.revision) && Number(value.revision) > 0 && typeof value.topicId === "string" && UUID.test(value.topicId);
}
export const marketingRequestStorage: MarketingRequestStorage = {
  async request(input) {
    return status(await rpc("request_marketing_subscription", { p_email: input.email, p_source: input.source,
      p_wording_version: input.wordingVersion, p_confirmation_token: input.confirmationToken, p_abuse_key: input.abuseKey,
      p_consent: input.consent, p_template_contract: input.templateContract }));
  },
  async confirm(token, preferenceToken) {
    return status(await rpc("confirm_marketing_subscription", { p_confirmation_token: token, p_preference_token: preferenceToken }));
  },
  async withdraw(token, scope) { return status(await rpc("withdraw_marketing_subscription", { p_token: token, p_scope: scope === "all" ? "global" : "topic" })); },
};
export const marketingServiceStorage: MarketingServiceStorage = {
  async claimSync(lease, limit) {
    const value = await rpc("claim_marketing_sync", { p_lease_token: lease, p_limit: limit });
    if (!Array.isArray(value) || value.length > limit || value.some((row: unknown) => !validIdentity(row)
      || typeof row.leaseToken !== "string" || !UUID.test(row.leaseToken) || typeof row.desiredSubscribed !== "boolean"
      || !["confirmed", "all", "welcome"].includes(String(row.syncScope))
      || (row.providerContactId !== null && (typeof row.providerContactId !== "string" || !UUID.test(row.providerContactId))))) {
      throw new Error("Invalid marketing synchronization work.");
    }
    return value as MarketingSyncJob[];
  },
  async validateSync(job) {
    return (await rpc("validate_marketing_sync", { p_subscriber_id: job.subscriberId, p_revision: job.revision, p_lease_token: job.leaseToken })) === true;
  },
  async admitImport(job) {
    const value = await rpc("admit_marketing_contact_import", { p_subscriber_id: job.subscriberId, p_revision: job.revision, p_lease_token: job.leaseToken });
    if (value === null) return null;
    if (!record(value) || typeof value.allowSubmit !== "boolean" || !Number.isSafeInteger(value.generation) || Number(value.generation) < 1
      || typeof value.admissionToken !== "string" || !UUID.test(value.admissionToken)
      || !["admitted", "submitted", "uncertain", "completed", "failed"].includes(String(value.state))
      || (value.importId !== null && (typeof value.importId !== "string" || !UUID.test(value.importId)))) throw new Error("Invalid Contact import admission.");
    return value as MarketingImportAdmission;
  },
  async recordImport(job, admission, importId, outcome) {
    return (await rpc("record_marketing_contact_import", { p_subscriber_id: job.subscriberId, p_generation: admission.generation,
      p_admission_token: admission.admissionToken, p_import_id: importId, p_outcome: outcome })) === true;
  },
  async claimImports(lease, limit) {
    const value = await rpc("claim_marketing_contact_imports", { p_lease_token: lease, p_limit: limit });
    if (!Array.isArray(value) || value.length > limit || value.some((row: unknown) => !record(row)
      || typeof row.subscriberId !== "string" || !UUID.test(row.subscriberId) || !Number.isSafeInteger(row.generation) || Number(row.generation) < 1
      || typeof row.email !== "string" || typeof row.leaseToken !== "string" || !UUID.test(row.leaseToken)
      || (row.importId !== null && (typeof row.importId !== "string" || !UUID.test(row.importId))))) throw new Error("Invalid Contact import work.");
    return value as MarketingImportJob[];
  },
  async finishImport(job, outcome) {
    return (await rpc("finish_marketing_contact_import", { p_subscriber_id: job.subscriberId, p_generation: job.generation,
      p_lease_token: job.leaseToken, p_outcome: outcome })) === true;
  },
  async finishSync(job, contactId, outcome) {
    return (await rpc("finish_marketing_sync", { p_subscriber_id: job.subscriberId, p_revision: job.revision,
      p_lease_token: job.leaseToken, p_contact_id: contactId, p_topic_id: job.topicId, p_outcome: outcome })) === true;
  },
  async readContext(subscriberId, generation) {
    const value = await rpc("read_marketing_send_context", { p_subscriber_id: subscriberId, p_generation: generation });
    if (value === null) return null;
    if (!validIdentity(value) || typeof value.subscribed !== "boolean" || typeof value.syncReady !== "boolean"
      || (value.contactId !== null && (typeof value.contactId !== "string" || !UUID.test(value.contactId)))) throw new Error("Invalid marketing send context.");
    return value as MarketingSendContext;
  },
  async observe(input) {
    return (await rpc("record_marketing_provider_observation", { p_subscriber_id: input.subscriberId, p_generation: input.generation,
      p_revision: input.revision, p_contact_id: input.contactId, p_topic_id: input.topicId,
      p_global_allowed: input.globalAllowed, p_topic_allowed: input.topicAllowed })) === true;
  },
};
