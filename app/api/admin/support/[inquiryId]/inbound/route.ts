import { handleInboundReview } from "@/lib/support/inbound-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ inquiryId: string }> }) {
  return handleInboundReview(request, (await context.params).inquiryId);
}
