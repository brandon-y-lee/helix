import { productionMarketingLanding } from "@/components/marketing/production-marketing-document";
import { productionMarketingEnrollmentEnabled } from "@/lib/production-marketing/config";

export const dynamic = "force-dynamic";

export async function GET() {
  return productionMarketingLanding("enrollment", await productionMarketingEnrollmentEnabled(process.env));
}

export async function HEAD() {
  return productionMarketingLanding("enrollment", await productionMarketingEnrollmentEnabled(process.env), "HEAD");
}
