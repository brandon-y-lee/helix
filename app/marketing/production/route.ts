import { productionMarketingLanding } from "@/components/marketing/production-marketing-document";
import { productionMarketingSignupStatus } from "@/lib/production-marketing/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return productionMarketingLanding("enrollment", (await productionMarketingSignupStatus(request, process.env)).enabled);
}

export async function HEAD(request: Request) {
  return productionMarketingLanding("enrollment", (await productionMarketingSignupStatus(request, process.env)).enabled, "HEAD");
}
