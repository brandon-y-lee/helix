import "server-only";
import { faqCategories } from "@/content/support/faq";
import { requireSupportAccess } from "@/lib/support/service";
import { supportRpc } from "@/lib/support/storage";
import { assertSupportOrigin, readSupportJson, SupportError, supportFailure, supportResponse, supportUuid } from "@/lib/support/request";
import type { SupportAiStatus } from "@/lib/support/types";

export type SupportAiDependencies = {
  env: Record<string, string | undefined>;
  requireAccess: typeof requireSupportAccess;
  rpc: typeof supportRpc;
};
export const supportAiDefaults: SupportAiDependencies = { env: process.env, requireAccess: requireSupportAccess, rpc: supportRpc };

export function supportAiOwner(env: Record<string, string | undefined>): string | null {
  if (env.HELIX_SUPPORT_AI_ENABLED !== "true" || env.HELIX_EMAIL_ENVIRONMENT !== "sandbox"
    || env.HELIX_EMAIL_MODE !== "restricted" || !/^[^\s]{32,256}$/.test(env.HELIX_SUPPORT_AI_WORKER_SECRET ?? "")) return null;
  try { return supportUuid(env.HELIX_SUPPORT_AI_OWNER_ID).toLowerCase(); } catch { return null; }
}

// These reviewed answers retain their unavailable/planned qualifiers. Raw policy numbers do not.
const factIds = ["medical-advice", "skin-suitability", "full-ingredients", "checkout-availability",
  "shipping-timing", "return-window", "refund-timing", "private-details"];
export const supportAiFacts = factIds.map((id) => {
  const item = faqCategories.flatMap((category) => category.items).find((entry) => entry.id === id);
  if (!item) throw new Error("Support drafting knowledge is unavailable.");
  return { id: `faq:${id}`, text: `${item.question} ${item.answer}` };
});

function status(data: unknown): SupportAiStatus {
  if (!data || typeof data !== "object" || !("job" in data)) throw new SupportError("support_unavailable");
  return { ...(data as Omit<SupportAiStatus, "available">), available: true };
}

export async function readSupportAiStatus(actorId: string, inquiryId: string, deps = supportAiDefaults): Promise<SupportAiStatus> {
  const ownerId = supportAiOwner(deps.env);
  if (!ownerId || actorId !== ownerId) return { available: false, job: null };
  return status(await deps.rpc("get_support_ai_draft", { p_actor_id: actorId, p_owner_id: ownerId, p_inquiry_id: supportUuid(inquiryId) }));
}

export async function handleSupportAiRequest(request: Request, inquiryId: string, deps = supportAiDefaults): Promise<Response> {
  try {
    const { userId } = await deps.requireAccess("support.reply");
    if (request.method === "GET") return supportResponse(await readSupportAiStatus(userId, inquiryId, deps));
    assertSupportOrigin(request);
    const ownerId = supportAiOwner(deps.env);
    if (!ownerId) throw new SupportError("ai_unavailable");
    if (userId !== ownerId) throw new SupportError("forbidden");
    if (request.method !== "POST") throw new SupportError("invalid_support_input");
    const body = await readSupportJson(request);
    const common = { p_actor_id: userId, p_owner_id: ownerId, p_inquiry_id: supportUuid(inquiryId) };
    if (body.action === "cancel" && Object.keys(body).length === 2) {
      return supportResponse(status(await deps.rpc("cancel_support_ai_draft", { ...common, p_job_id: supportUuid(body.jobId) })));
    }
    if (body.action !== "request" || Object.keys(body).length !== 4
      || typeof body.expectedRevision !== "number" || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1 || body.expectedRevision > 2_147_483_646
      || typeof body.expectedDraftVersion !== "number" || !Number.isSafeInteger(body.expectedDraftVersion) || body.expectedDraftVersion < 0 || body.expectedDraftVersion > 2_147_483_646) {
      throw new SupportError("invalid_support_input");
    }
    return supportResponse(status(await deps.rpc("request_support_ai_draft", { ...common,
      p_request_id: supportUuid(body.requestId), p_expected_revision: body.expectedRevision,
      p_expected_draft_version: body.expectedDraftVersion, p_facts: supportAiFacts })));
  } catch (error) { return supportFailure(error); }
}
