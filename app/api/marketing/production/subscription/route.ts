import { handleProductionMarketingRequest } from "@/lib/production-marketing/requests";
import { createProductionMarketingStorage, productionMarketingSignupStatus } from "@/lib/production-marketing/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;
export async function GET(request: Request) {
  const status = await productionMarketingSignupStatus(request, process.env);
  return Response.json(status, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  return handleProductionMarketingRequest(request, "subscription", { storage: createProductionMarketingStorage(process.env), env: process.env });
}
