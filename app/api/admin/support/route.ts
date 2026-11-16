import { handleSupportAdminRequest } from "@/lib/support/admin-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleSupportAdminRequest(request); }
