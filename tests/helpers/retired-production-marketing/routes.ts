// Test-only adapters for the historical data and provider contracts. These
// handlers are intentionally absent from the storefront's route tree.
import { productionMarketingEnrollmentEnabled } from "@/lib/production-marketing/config";
import { createProductionMarketingDeliveryStorage } from "@/lib/production-marketing/delivery-storage";
import { productionMarketingProvider } from "./delivery-provider";
import { productionMarketingLanding } from "./document";
import { handleProductionMarketingRequest, handleProductionMarketingUnsubscribe } from "./requests";
import { createProductionMarketingStorage, productionMarketingSignupStatus } from "./storage";
import { dispatchProductionMarketing } from "./worker";

const requestDependencies = () => ({ env: process.env, storage: createProductionMarketingStorage(process.env) });
export async function signupStatus(request: Request) {
  return Response.json(await productionMarketingSignupStatus(request, process.env), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
export const subscribe = (request: Request) => handleProductionMarketingRequest(request, "subscription", requestDependencies());
export const confirm = (request: Request) => handleProductionMarketingRequest(request, "confirm", requestDependencies());
export const withdraw = (request: Request) => handleProductionMarketingRequest(request, "preferences", requestDependencies());
export const oneClick = (request: Request) => handleProductionMarketingUnsubscribe(request, requestDependencies());
export const dispatch = (request: Request) => dispatchProductionMarketing(request, {
  env: process.env, storage: createProductionMarketingDeliveryStorage(process.env), provider: productionMarketingProvider,
});
export const confirmationPage = async () => productionMarketingLanding("confirm", await productionMarketingEnrollmentEnabled(process.env));
export const preferencePage = async () => productionMarketingLanding("preferences", await productionMarketingEnrollmentEnabled(process.env));
