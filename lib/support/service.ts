import "server-only";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { SupportError, supportUuid } from "@/lib/support/request";
import { supportRpc } from "@/lib/support/storage";
import type { SupportInquiryDetail, SupportInquiryList, SupportMutation } from "@/lib/support/types";

export async function requireSupportAccess(capability: "support.read" | "support.reply") {
  try {
    return await requireAdminCapability(capability);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    throw new SupportError(code === "authentication_required" ? "authentication_required"
      : code === "capability_required" ? "forbidden" : "support_unavailable");
  }
}

export async function listSupportInquiriesForActor(actorId: string, query: { status?: string; page?: number }): Promise<SupportInquiryList> {
  const status = query.status && ["open", "closed", "all"].includes(query.status) ? query.status : "open";
  const page = Number.isSafeInteger(query.page) && query.page! >= 0 && query.page! <= 1000 ? query.page! : 0;
  const data = await supportRpc("list_support_inquiries", { p_actor_id: actorId, p_status: status, p_page: page });
  if (!data || typeof data !== "object" || !("inquiries" in data) || !Array.isArray(data.inquiries)
    || data.inquiries.length > 25 || !("nextPage" in data)) throw new SupportError("support_unavailable");
  return data as SupportInquiryList;
}

export async function getSupportInquiryForActor(actorId: string, id: string, before?: string): Promise<SupportInquiryDetail | null> {
  const data = await supportRpc("get_support_inquiry", { p_actor_id: actorId, p_inquiry_id: supportUuid(id), p_before_message_id: before === undefined ? null : supportUuid(before) });
  if (data === null) return null;
  if (!data || typeof data !== "object" || !("id" in data) || data.id !== id
    || !("messages" in data) || !Array.isArray(data.messages) || data.messages.length > 50
    || !("nextMessageCursor" in data) || (data.nextMessageCursor !== null && typeof data.nextMessageCursor !== "string")) throw new SupportError("support_unavailable");
  return data as SupportInquiryDetail;
}

export async function mutateSupportInquiryForActor(actorId: string, id: string, mutation: SupportMutation): Promise<SupportInquiryDetail> {
  const data = await supportRpc("mutate_support_inquiry", { p_actor_id: actorId, p_inquiry_id: supportUuid(id),
    p_expected_revision: mutation.expectedRevision, p_action: mutation.action,
    p_expected_draft_version: mutation.action === "save_draft" ? mutation.expectedDraftVersion
      : mutation.action === "approve_reply" ? mutation.draftVersion : null,
    p_subject: mutation.action === "save_draft" ? mutation.subject : null,
    p_body: mutation.action === "save_draft" || mutation.action === "add_note" ? mutation.body : null,
    p_status: mutation.action === "set_status" ? mutation.status : null });
  if (!data || typeof data !== "object" || !("id" in data) || data.id !== id
    || !("messages" in data) || !Array.isArray(data.messages) || data.messages.length > 50
    || !("nextMessageCursor" in data) || (data.nextMessageCursor !== null && typeof data.nextMessageCursor !== "string")) throw new SupportError("support_unavailable");
  return data as SupportInquiryDetail;
}

