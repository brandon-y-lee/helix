import { expect, it, vi } from "vitest";
import { verifyMarketingPreferences, synchronizeMarketingContacts, reconcileMarketingImports, type MarketingSyncJob } from "@/lib/marketing/service";
import { MarketingProviderError } from "@/lib/marketing/provider";
const job: MarketingSyncJob = { subscriberId: "513b8721-ce66-4b3e-a44b-1c8881b556dc", email: "delivered@resend.dev",
  generation: 1, revision: 2, desiredSubscribed: true, syncScope: "confirmed", providerContactId: null,
  topicId: "61296d74-fad4-4c74-83d3-6a3e17ab9f74", leaseToken: "1dd29d69-1a8f-428c-bdd9-d7647791bbae" };
const contact = { id: "5f0d20d5-f4fd-4698-823d-c3b69e757bf3", email: job.email, unsubscribed: false };
const env = { HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted", HELIX_MARKETING_ENABLED: "true",
  HELIX_EMAIL_OWNER_RECIPIENT: "owner@example.test", HELIX_EMAIL_ALLOW_SIMULATORS: "true", RESEND_API_KEY: "re_synthetic" };
function setup() {
  return { env, storage: { claimSync: vi.fn().mockResolvedValue([job]), validateSync: vi.fn().mockResolvedValue(true),
    admitImport: vi.fn().mockResolvedValue({ allowSubmit: true, generation: 1, admissionToken: job.leaseToken, importId: null, state: "admitted" }),
    recordImport: vi.fn().mockResolvedValue(true), claimImports: vi.fn().mockResolvedValue([]), finishImport: vi.fn().mockResolvedValue(true), finishSync: vi.fn().mockResolvedValue(true), readContext: vi.fn().mockResolvedValue({ ...job, contactId: contact.id, subscribed: true, syncReady: true }),
    observe: vi.fn().mockResolvedValue(true) }, provider: {
    getContact: vi.fn().mockResolvedValue(contact), createImport: vi.fn().mockResolvedValue(contact.id),
    getTopicDefault: vi.fn().mockResolvedValue("opt_in"), readImport: vi.fn().mockResolvedValue({ id: contact.id, status: "completed" }),
    updateContact: vi.fn().mockResolvedValue(undefined), updateTopic: vi.fn().mockResolvedValue(undefined),
    getTopic: vi.fn().mockResolvedValue("opt_in"),
  } };
}
it("permits welcome only after fresh global and Topic checks for the current local generation", async () => {
  const deps = setup();
  expect(await verifyMarketingPreferences({ subscriberId: job.subscriberId, generation: 1, revision: 2, topicId: job.topicId }, deps)).toBe("eligible");
  expect(deps.storage.observe).toHaveBeenCalledWith(expect.objectContaining({ subscriberId: job.subscriberId,
    generation: 1, revision: 2, contactId: contact.id, topicId: job.topicId, globalAllowed: true, topicAllowed: true }));
});
it("claims at most one import and one preference job per bounded worker invocation", async () => {
  const deps = setup();
  await reconcileMarketingImports(deps);
  await synchronizeMarketingContacts(deps);
  expect(deps.storage.claimImports).toHaveBeenCalledWith(expect.any(String), 1);
  expect(deps.storage.claimSync).toHaveBeenCalledWith(expect.any(String), 1);
});
it.each(["global", "topic"])("honors a provider %s withdrawal without waiting for a webhook", async (scope) => {
  const deps = setup();
  if (scope === "global") deps.provider.getContact.mockResolvedValue({ ...contact, unsubscribed: true });
  else deps.provider.getTopic.mockResolvedValue("opt_out");
  expect(await verifyMarketingPreferences({ subscriberId: job.subscriberId, generation: 1, revision: 2, topicId: job.topicId }, deps)).toBe("blocked");
  expect(deps.storage.observe).toHaveBeenCalledWith(expect.objectContaining({ globalAllowed: scope !== "global", topicAllowed: false }));
});
it("fails closed on provider outage and stale observation writes", async () => {
  const deps = setup();
  deps.provider.getContact.mockRejectedValueOnce(new Error("provider unavailable"));
  const binding = { subscriberId: job.subscriberId, generation: 1, revision: 2, topicId: job.topicId };
  expect(await verifyMarketingPreferences(binding, deps)).toBe("deferred");
  deps.storage.observe.mockResolvedValue(false);
  expect(await verifyMarketingPreferences(binding, deps)).toBe("deferred");
});
it("waits for contact synchronization rather than terminally dropping a fresh welcome", async () => {
  const deps = setup(); deps.storage.readContext.mockResolvedValue({ ...job, contactId: null, subscribed: true });
  expect(await verifyMarketingPreferences({ subscriberId: job.subscriberId, generation: 1, revision: 2, topicId: job.topicId }, deps)).toBe("deferred");
  expect(deps.provider.getContact).not.toHaveBeenCalled();
});
it("a provider import or stale opt-in cannot grant local consent", async () => {
  const deps = setup(); deps.storage.readContext.mockResolvedValue({ ...job, contactId: contact.id, subscribed: false });
  expect(await verifyMarketingPreferences({ subscriberId: job.subscriberId, generation: 1, revision: 2, topicId: job.topicId }, deps)).toBe("blocked");
  expect(deps.provider.getContact).not.toHaveBeenCalled();
});

it("reconciles an existing Contact read-only without overwriting either native preference", async () => {
  const deps = setup();
  expect(await synchronizeMarketingContacts(deps)).toMatchObject({ claimed: 1, synced: 1, deferred: 0 });
  expect(deps.provider.updateContact).not.toHaveBeenCalled();
  expect(deps.provider.updateTopic).not.toHaveBeenCalled();
  expect(deps.provider.createImport).not.toHaveBeenCalled();
});
it.each(["global", "topic"])("preserves an existing %s deny after a new local confirmation", async (scope) => {
  const deps = setup();
  if (scope === "global") deps.provider.getContact.mockResolvedValue({ ...contact, unsubscribed: true });
  else deps.provider.getTopic.mockResolvedValue("opt_out");
  expect(await synchronizeMarketingContacts(deps)).toMatchObject({ synced: 0, deferred: 1 });
  expect(deps.provider.updateContact).not.toHaveBeenCalled();
  expect(deps.provider.updateTopic).not.toHaveBeenCalled();
  expect(deps.storage.observe).toHaveBeenCalledWith(expect.objectContaining({ globalAllowed: scope !== "global", topicAllowed: false }));
});
it("persists a known global denial without depending on an available Topic lookup", async () => {
  const deps = setup();
  deps.provider.getContact.mockResolvedValue({ ...contact, unsubscribed: true });
  deps.provider.getTopic.mockRejectedValue(new Error("Topic lookup unavailable"));
  expect(await synchronizeMarketingContacts(deps)).toMatchObject({ synced: 0, deferred: 1 });
  expect(deps.storage.observe).toHaveBeenCalledWith(expect.objectContaining({ globalAllowed: false, topicAllowed: false }));
  deps.storage.observe.mockClear();
  expect(await verifyMarketingPreferences({ subscriberId: job.subscriberId, generation: 1, revision: 2, topicId: job.topicId }, deps)).toBe("blocked");
  expect(deps.storage.observe).toHaveBeenCalledWith(expect.objectContaining({ globalAllowed: false, topicAllowed: false }));
  expect(deps.provider.getTopic).not.toHaveBeenCalled();
});
it("submits one insert-only import after validating the Topic and durable admission", async () => {
  const deps = setup(); deps.provider.getContact.mockResolvedValue(null);
  expect(await synchronizeMarketingContacts(deps)).toMatchObject({ deferred: 1, synced: 0 });
  expect(deps.provider.getTopicDefault).toHaveBeenCalledWith(job.topicId, "re_synthetic");
  expect(deps.provider.createImport).toHaveBeenCalledWith(job.email, "re_synthetic");
  expect(deps.storage.recordImport).toHaveBeenCalledWith(job, expect.objectContaining({ admissionToken: job.leaseToken }), contact.id, "submitted");
  expect(deps.storage.finishSync).toHaveBeenCalledWith(job, null, "retry");
});
it("never resubmits an admitted import after a crash or ambiguous response", async () => {
  const deps = setup(); deps.provider.getContact.mockResolvedValue(null);
  deps.storage.admitImport.mockResolvedValue({ allowSubmit: false, generation: 1, admissionToken: job.leaseToken, importId: null, state: "uncertain" });
  expect(await synchronizeMarketingContacts(deps)).toMatchObject({ deferred: 1 });
  expect(deps.provider.createImport).not.toHaveBeenCalled();
});
it("persists an unknown import response without granting send eligibility", async () => {
  const deps = setup(); deps.provider.getContact.mockResolvedValue(null);
  deps.provider.createImport.mockRejectedValue(new Error("lost response"));
  expect(await synchronizeMarketingContacts(deps)).toMatchObject({ deferred: 1, synced: 0 });
  expect(deps.storage.recordImport).toHaveBeenCalledWith(job, expect.anything(), null, "uncertain",
    { category: "provider_unavailable", httpStatus: null, providerName: null, retryAfterSeconds: null });
  expect(deps.storage.observe).not.toHaveBeenCalled();
});
it("records only an explicit rate rejection for a future durably admitted retry", async () => {
  const deps = setup(); deps.provider.getContact.mockResolvedValue(null);
  deps.provider.createImport.mockRejectedValue(new MarketingProviderError("provider_unavailable",
    { httpStatus: 429, providerName: "rate_limit_exceeded", retryAfter: "10" }));
  expect(await synchronizeMarketingContacts(deps)).toMatchObject({ deferred: 1, synced: 0 });
  expect(deps.storage.recordImport).toHaveBeenCalledWith(job, expect.anything(), null, "rate_limited",
    { category: "rate_limited", httpStatus: 429, providerName: "rate_limit_exceeded", retryAfterSeconds: 10 });
  expect(deps.provider.createImport).toHaveBeenCalledTimes(1);
  expect(deps.storage.observe).not.toHaveBeenCalled();
});
it.each([
  { httpStatus: 429, providerName: "validation_error" },
  { httpStatus: 429, providerName: "daily_quota_exceeded" },
  { httpStatus: 503, providerName: "rate_limit_exceeded" },
  { httpStatus: 500, providerName: "application_error" },
])("keeps every other failed import response unresolved %#", async (details) => {
  const deps = setup(); deps.provider.getContact.mockResolvedValue(null);
  deps.provider.createImport.mockRejectedValue(new MarketingProviderError("provider_unavailable", details));
  await synchronizeMarketingContacts(deps);
  expect(deps.storage.recordImport).toHaveBeenCalledWith(job, expect.anything(), null, "uncertain", expect.any(Object));
  expect(deps.provider.createImport).toHaveBeenCalledTimes(1);
});
it("does not replay an import when recording its rate rejection fails", async () => {
  const deps = setup(); deps.provider.getContact.mockResolvedValue(null);
  deps.provider.createImport.mockRejectedValue(new MarketingProviderError("provider_unavailable", { httpStatus: 429, providerName: "rate_limit_exceeded" }));
  deps.storage.recordImport.mockRejectedValueOnce(new Error("database unavailable"));
  await synchronizeMarketingContacts(deps);
  expect(deps.provider.createImport).toHaveBeenCalledTimes(1);
  expect(deps.storage.recordImport).toHaveBeenCalledTimes(1);
});
it("rechecks current native denial before any due rate-limit retry", async () => {
  const deps = setup(); deps.provider.getContact.mockResolvedValue({ ...contact, unsubscribed: true });
  deps.storage.admitImport.mockResolvedValue({ allowSubmit: true, generation: 1, admissionToken: job.leaseToken, importId: null, state: "retry_wait" });
  await synchronizeMarketingContacts(deps);
  expect(deps.storage.admitImport).not.toHaveBeenCalled(); expect(deps.provider.createImport).not.toHaveBeenCalled();
  expect(deps.storage.observe).toHaveBeenCalledWith(expect.objectContaining({ globalAllowed: false }));
});
it("does not recreate a missing bound Contact or enroll with the wrong Topic default", async () => {
  const deps = setup(); deps.provider.getContact.mockResolvedValue(null);
  deps.storage.claimSync.mockResolvedValue([{ ...job, providerContactId: contact.id }]);
  await synchronizeMarketingContacts(deps);
  expect(deps.storage.admitImport).not.toHaveBeenCalled();
  deps.storage.claimSync.mockResolvedValue([job]); deps.provider.getTopicDefault.mockResolvedValue("opt_out");
  await synchronizeMarketingContacts(deps);
  expect(deps.storage.admitImport).not.toHaveBeenCalled();
});
it("a welcome-only withdrawal never changes global permission", async () => {
  const deps = setup(); deps.storage.claimSync.mockResolvedValue([{ ...job, syncScope: "welcome", desiredSubscribed: false }]);
  expect(await synchronizeMarketingContacts(deps)).toMatchObject({ synced: 1 });
  expect(deps.provider.updateContact).not.toHaveBeenCalled();
  expect(deps.provider.updateTopic).toHaveBeenCalledWith(contact.id, job.topicId, false, "re_synthetic");
});
it("checks the local revision immediately before every restrictive provider write", async () => {
  const deps = setup(); deps.storage.claimSync.mockResolvedValue([{ ...job, syncScope: "all", desiredSubscribed: false }]);
  deps.storage.validateSync.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect(await synchronizeMarketingContacts(deps)).toMatchObject({ deferred: 1, synced: 0 });
  expect(deps.provider.updateContact).not.toHaveBeenCalled();
});
it("cannot persist preference evidence after its lease or consent revision was replaced", async () => {
  const deps = setup(); deps.storage.finishSync.mockResolvedValue(false);
  expect(await synchronizeMarketingContacts(deps)).toMatchObject({ synced: 0, deferred: 1 });
  expect(deps.storage.observe).not.toHaveBeenCalled();
});
it("retains a restrictive observation for an already bound Contact when the sync lease changes", async () => {
  const deps = setup();
  deps.storage.claimSync.mockResolvedValue([{ ...job, providerContactId: contact.id }]);
  deps.provider.getContact.mockResolvedValue({ ...contact, unsubscribed: true });
  deps.storage.finishSync.mockResolvedValue(false);
  expect(await synchronizeMarketingContacts(deps)).toMatchObject({ synced: 0, deferred: 1 });
  expect(deps.storage.observe).toHaveBeenCalledWith(expect.objectContaining({ generation: 1, revision: 2,
    contactId: contact.id, globalAllowed: false, topicAllowed: false }));
});
it("reconciles import completion through storage without granting or sending anything", async () => {
  const deps = setup(), imported = { subscriberId: job.subscriberId, generation: 1, email: job.email, importId: contact.id, leaseToken: job.leaseToken };
  deps.storage.claimImports.mockResolvedValue([imported]);
  expect(await reconcileMarketingImports(deps)).toMatchObject({ claimed: 1, completed: 1 });
  expect(deps.storage.finishImport).toHaveBeenCalledWith(imported, "completed");
  expect(deps.storage.finishSync).not.toHaveBeenCalled();
  expect(deps.storage.observe).not.toHaveBeenCalled();
});
it("keeps an import with no returned ID unresolved even if a Contact is now visible", async () => {
  const deps = setup(), imported = { subscriberId: job.subscriberId, generation: 1, email: job.email, importId: null, leaseToken: job.leaseToken };
  deps.storage.claimImports.mockResolvedValue([imported]);
  expect(await reconcileMarketingImports(deps)).toMatchObject({ completed: 0, deferred: 1 });
  expect(deps.storage.finishImport).toHaveBeenCalledWith(imported, "pending");
  expect(deps.provider.createImport).not.toHaveBeenCalled();
});

it("retains the known import identity if its first database persistence fails", async () => {
  const deps = setup(); deps.provider.getContact.mockResolvedValue(null);
  deps.storage.recordImport.mockRejectedValueOnce(new Error("database connection lost")).mockResolvedValue(true);
  await synchronizeMarketingContacts(deps);
  expect(deps.provider.createImport).toHaveBeenCalledTimes(1);
  expect(deps.storage.recordImport).toHaveBeenNthCalledWith(2, job, expect.anything(), contact.id, "submitted");
});
