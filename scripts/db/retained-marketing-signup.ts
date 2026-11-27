// Exercise signup as the earlier client against the original P2/P3 schema in
// the owned PostgreSQL harness. New storefronts qualify only the direct cohort.
import { confirmationWorkerQualification } from "../../lib/production-marketing/delivery-config";
import { createProductionMarketingStorage } from "@/tests/helpers/retired-production-marketing/storage";
import type { ProductionMarketingEnvironment } from "../../lib/production-marketing/contract";
import type { ProductionMarketingSubscriptionRequest } from "@/tests/helpers/retired-production-marketing/requests";

export function retainedMarketingSignup(env: ProductionMarketingEnvironment, sql: (statement: string) => string) {
  const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const binding = () => {
    const { p_contract_hash, p_worker_binding_hash } = confirmationWorkerQualification(env);
    return [p_contract_hash, p_worker_binding_hash].map(quote).join(",");
  };
  return {
    ...createProductionMarketingStorage(env),
    async enrollmentReady() {
      return env.HELIX_PRODUCTION_MARKETING_ENABLED === "true" && env.HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED === "true" &&
        sql(`SET ROLE service_role; SELECT public.production_marketing_enrollment_ready(${binding()});`) === "t";
    },
    async request(input: ProductionMarketingSubscriptionRequest) {
      const ids = [input.email, input.confirmationHash, input.preferenceHash, input.requesterHash].map(quote).join(",");
      return sql(`SET ROLE service_role; SELECT public.request_qualified_production_marketing_subscription(
        ${binding()},${ids},true,${quote(input.wordingVersion)},${quote(JSON.stringify(input.deliveryPayload))}::jsonb);`) === "t";
    },
  };
}
