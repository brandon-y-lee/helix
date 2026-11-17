import { productionMarketingLanding } from "@/components/marketing/production-marketing-document";
import { productionMarketingEnrollmentEnabled } from "@/lib/production-marketing/config";

export const dynamic = "force-dynamic";

export function GET() {
  return productionMarketingLanding("preferences", productionMarketingEnrollmentEnabled(process.env));
}

export function HEAD() {
  return productionMarketingLanding("preferences", productionMarketingEnrollmentEnabled(process.env), "HEAD");
}
