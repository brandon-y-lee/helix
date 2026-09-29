import { handleSupportAdminRequest } from "@/lib/support/admin-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ inquiryId: string }> };
export async function GET(request: Request, context: Context) {
  return handleSupportAdminRequest(request, (await context.params).inquiryId);
}
export async function POST(request: Request, context: Context) {
  return handleSupportAdminRequest(request, (await context.params).inquiryId);
}
