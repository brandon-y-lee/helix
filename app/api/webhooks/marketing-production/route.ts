import { receiveProductionMarketingEvent } from "@/lib/production-marketing/events";
import { createProductionMarketingEventStorage } from "@/lib/production-marketing/event-storage";
import { productionEmailDelegates } from "@/lib/production-email-gateway/runtime";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request: Request) {
  const { record, preference, hold } = createProductionMarketingEventStorage(process.env);
  const { support: supportSent } = productionEmailDelegates(process.env);
  return receiveProductionMarketingEvent(request, { env: process.env, record, preference, hold, supportSent });
}
