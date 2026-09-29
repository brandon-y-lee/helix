import "server-only";
import { randomUUID } from "node:crypto";
import { assertEmailEnvironment, emailRecipientAllowed, type EmailEnvironment } from "@/lib/email/config";
import { marketingProviderEvidence, type MarketingProviderEvidence } from "@/lib/marketing/provider";

export type MarketingSyncJob = {
  subscriberId: string; email: string; generation: number; revision: number; desiredSubscribed: boolean;
  syncScope: "confirmed" | "all" | "welcome"; providerContactId: string | null; topicId: string; leaseToken: string;
};
export type MarketingSendContext = {
  subscriberId: string; email: string; generation: number; revision: number;
  contactId: string | null; topicId: string; subscribed: boolean; syncReady: boolean;
};
export type MarketingImportAdmission = {
  allowSubmit: boolean; generation: number; admissionToken: string; importId: string | null;
  state: "admitted" | "submitted" | "uncertain" | "completed" | "failed";
};
export type MarketingImportJob = { subscriberId: string; generation: number; email: string; importId: string | null; leaseToken: string };
export interface MarketingContactProvider {
  getContact(identifier: string, apiKey: string): Promise<{ id: string; email: string; unsubscribed: boolean } | null>;
  createImport(email: string, apiKey: string): Promise<string>;
  readImport(importId: string, apiKey: string): Promise<{ id: string; status: "queued" | "in_progress" | "completed" | "failed" }>;
  getTopicDefault(topicId: string, apiKey: string): Promise<"opt_in" | "opt_out">;
  updateContact(id: string, unsubscribed: true, apiKey: string): Promise<void>;
  updateTopic(id: string, topicId: string, subscribed: false, apiKey: string): Promise<void>;
  getTopic(id: string, topicId: string, apiKey: string): Promise<"opt_in" | "opt_out">;
}
export interface MarketingServiceStorage {
  claimSync(lease: string, limit: number): Promise<MarketingSyncJob[]>;
  validateSync(job: MarketingSyncJob): Promise<boolean>;
  admitImport(job: MarketingSyncJob): Promise<MarketingImportAdmission | null>;
  recordImport(job: MarketingSyncJob, admission: MarketingImportAdmission, importId: string | null, outcome: "submitted" | "uncertain", failure?: MarketingProviderEvidence): Promise<boolean>;
  claimImports(lease: string, limit: number): Promise<MarketingImportJob[]>;
  finishImport(job: MarketingImportJob, outcome: "pending" | "completed" | "failed"): Promise<boolean>;
  finishSync(job: MarketingSyncJob, contactId: string | null, outcome: "synced" | "retry"): Promise<boolean>;
  readContext(subscriberId: string, generation: number): Promise<MarketingSendContext | null>;
  observe(input: { subscriberId: string; generation: number; revision: number; contactId: string; topicId: string;
    globalAllowed: boolean; topicAllowed: boolean }): Promise<boolean>;
}
export type MarketingServiceDependencies = { storage: MarketingServiceStorage; provider: MarketingContactProvider; env: EmailEnvironment };
function key(env: EmailEnvironment) {
  assertEmailEnvironment(env);
  const value = env.RESEND_API_KEY ?? "";
  if (!/^re_[A-Za-z0-9_-]+$/.test(value)) throw new Error("Marketing provider is unavailable.");
  return value;
}

export async function synchronizeMarketingContacts({ storage, provider, env }: MarketingServiceDependencies) {
  const apiKey = key(env), jobs = await storage.claimSync(randomUUID(), 1);
  const result = { claimed: jobs.length, synced: 0, deferred: 0 };
  for (const job of jobs) {
    let contactId = job.providerContactId;
    try {
      if (!emailRecipientAllowed(job.email, env) || !await storage.validateSync(job)) { result.deferred++; continue; }
      const contact = await provider.getContact(contactId ?? job.email, apiKey);
      if (contact && (contact.email.toLowerCase() !== job.email || (contactId && contact.id !== contactId))) throw new Error("Contact binding differs.");
      if (!contact && contactId) throw new Error("A bound Contact is missing.");
      contactId = contact?.id ?? null;
      if (job.syncScope === "confirmed") {
        if (!contactId) {
          // Skip-mode import is the only native initialization. It never updates
          // existing permission; an ambiguous submission is never repeated.
          if (await provider.getTopicDefault(job.topicId, apiKey) !== "opt_in") throw new Error("Topic default differs.");
          const admission = await storage.admitImport(job);
          if (admission?.allowSubmit) {
            let importId: string | null = null;
            try {
              importId = await provider.createImport(job.email, apiKey);
              await storage.recordImport(job, admission, importId, "submitted");
            } catch (error) {
              // Preserve a returned provider identity across a database failure;
              // retry only this local recording, never the import submission.
              if (importId) await storage.recordImport(job, admission, importId, "submitted");
              else await storage.recordImport(job, admission, null, "uncertain", marketingProviderEvidence(error));
            }
          }
          await storage.finishSync(job, null, "retry"); result.deferred++; continue;
        }
        // A known global withdrawal is sufficient evidence. Do not discard it
        // because an unrelated Topic lookup is unavailable.
        const topic = contact!.unsubscribed ? "opt_out" : await provider.getTopic(contactId, job.topicId, apiKey);
        if (await storage.finishSync(job, contactId, "synced")) {
          const saved = await storage.observe({ subscriberId: job.subscriberId, generation: job.generation, revision: job.revision,
            contactId, topicId: job.topicId, globalAllowed: !contact!.unsubscribed, topicAllowed: topic === "opt_in" });
          if (saved && !contact!.unsubscribed && topic === "opt_in") result.synced++;
          else result.deferred++;
        } else result.deferred++;
        continue;
      }
      if (contactId) {
        if (job.syncScope === "all") {
          if (!await storage.validateSync(job)) { result.deferred++; continue; }
          await provider.updateContact(contactId, true, apiKey);
        }
        if (!await storage.validateSync(job)) { result.deferred++; continue; }
        await provider.updateTopic(contactId, job.topicId, false, apiKey);
      }
      if (await storage.finishSync(job, contactId, "synced")) result.synced++;
      else result.deferred++;
    } catch {
      await storage.finishSync(job, contactId, "retry"); result.deferred++;
    }
  }
  return result;
}

export async function reconcileMarketingImports({ storage, provider, env }: MarketingServiceDependencies) {
  const apiKey = key(env), jobs = await storage.claimImports(randomUUID(), 1);
  const result = { claimed: jobs.length, completed: 0, deferred: 0 };
  for (const job of jobs) {
    try {
      if (!emailRecipientAllowed(job.email, env)) { result.deferred++; continue; }
      // A missing response ID cannot be inferred from Contact presence. Polling
      // remains alive for restrictive repair until an operator reconciles it.
      const imported = job.importId ? await provider.readImport(job.importId, apiKey) : null;
      const outcome = imported?.status === "completed" ? "completed" : imported?.status === "failed" ? "failed" : "pending";
      const saved = await storage.finishImport(job, outcome);
      if (saved && outcome === "completed") result.completed++;
      else result.deferred++;
    } catch {
      await storage.finishImport(job, "pending"); result.deferred++;
    }
  }
  return result;
}

export async function verifyMarketingPreferences(
  binding: { subscriberId: string; generation: number; revision: number; topicId: string },
  { storage, provider, env }: MarketingServiceDependencies,
): Promise<"eligible" | "blocked" | "deferred"> {
  try {
    const context = await storage.readContext(binding.subscriberId, binding.generation);
    if (!context || !context.subscribed || context.generation !== binding.generation || context.revision !== binding.revision
      || context.topicId !== binding.topicId || !emailRecipientAllowed(context.email, env)) return "blocked";
    if (!context.contactId || !context.syncReady) return "deferred";
    const apiKey = key(env), contact = await provider.getContact(context.contactId, apiKey);
    if (!contact || contact.id !== context.contactId || contact.email.toLowerCase() !== context.email) return "deferred";
    const topic = contact.unsubscribed ? "opt_out" : await provider.getTopic(contact.id, binding.topicId, apiKey);
    const saved = await storage.observe({ subscriberId: context.subscriberId, generation: context.generation, revision: context.revision,
      contactId: contact.id, topicId: context.topicId, globalAllowed: !contact.unsubscribed, topicAllowed: topic === "opt_in" });
    if (contact.unsubscribed || topic !== "opt_in") return "blocked";
    return saved ? "eligible" : "deferred";
  } catch { return "deferred"; }
}
