import { handleSupportAiRequest } from "@/lib/support/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ inquiryId: string }> };
export async function GET(request: Request, context: Context) {
  return handleSupportAiRequest(request, (await context.params).inquiryId);
}
export const POST = GET;
