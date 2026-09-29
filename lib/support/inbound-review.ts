import "server-only";
import { requireSupportAccess } from "@/lib/support/service";
import { supportRpc } from "@/lib/support/storage";
import { assertSupportOrigin, readSupportJson, SupportError, supportFailure, supportResponse, supportUuid } from "@/lib/support/request";

type ReviewAction = "accept" | "dismiss" | "retry";
export type InboundReviewDependencies = {
  requireAccess(capability: "support.reply"): Promise<{ userId: string }>;
  review(actor: string, inquiryId: string, inboundId: string, expectedRevision: number, action: ReviewAction): Promise<unknown>;
};
const defaults: InboundReviewDependencies = {
  requireAccess: requireSupportAccess,
  review: (actor, inquiryId, inboundId, expectedRevision, action) => supportRpc("review_support_inbound", {
    p_actor_id: actor, p_inquiry_id: inquiryId, p_inbound_id: inboundId, p_expected_revision: expectedRevision, p_action: action,
  }),
};

export async function handleInboundReview(request: Request, inquiryId: string, dependencies = defaults): Promise<Response> {
  try {
    assertSupportOrigin(request);
    const access = await dependencies.requireAccess("support.reply");
    const body = await readSupportJson(request);
    if (Object.keys(body).length !== 3 || !["accept", "dismiss", "retry"].includes(String(body.action))
      || typeof body.expectedRevision !== "number" || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1) throw new SupportError("invalid_support_input");
    const inquiry = await dependencies.review(access.userId, supportUuid(inquiryId), supportUuid(body.inboundId), body.expectedRevision, body.action as ReviewAction);
    return supportResponse({ inquiry });
  } catch (error) { return supportFailure(error); }
}
