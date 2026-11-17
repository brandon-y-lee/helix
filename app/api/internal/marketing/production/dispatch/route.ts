import { dispatchProductionMarketing } from "@/lib/production-marketing/worker";
import { createProductionMarketingDeliveryStorage } from "@/lib/production-marketing/delivery-storage";
import { productionMarketingProvider } from "@/lib/production-marketing/delivery-provider";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
  // Construction has no I/O. Caller authorization precedes every storage/provider action.
  return dispatchProductionMarketing(request,{env:process.env,storage:createProductionMarketingDeliveryStorage(process.env),provider:productionMarketingProvider});
}
