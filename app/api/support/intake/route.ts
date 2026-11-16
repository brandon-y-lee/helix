import { handleSupportIntakeRequest } from "@/lib/support/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleSupportIntakeRequest(request); }
export async function POST(request: Request) { return handleSupportIntakeRequest(request); }
