import { handleSupportAiWorkerRequest } from "@/lib/support/ai-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handleSupportAiWorkerRequest(request);
}
