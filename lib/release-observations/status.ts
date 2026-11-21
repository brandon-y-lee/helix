import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { productionDeploymentAuthorized } from "@/lib/release/deployment-authorization";
import { catalogWriteApiKey, catalogWebhookSecret } from "@/lib/algolia/credentials";
import { verifyPublicSearchBinding } from "@/lib/algolia/build-binding";
import { searchProducts } from "@/lib/algolia/search-client";
import { getIndexName } from "@/lib/algolia/server";
import { readCheckoutConfig, readPaymentProviderConfig } from "@/lib/checkout/config";
import { hasLivePaymentConfiguration, observeClosedLivePaymentProvider } from "@/lib/stripe/live-provider";
import { readCheckoutStorefront } from "@/lib/checkout/storefront";
import { measurementConfig } from "@/lib/privacy/measurement-config";
import { readPublicSupabaseConnection, runtimeSupabaseTarget, SUPABASE_PROJECT_REFS, verifyHostedSiteOrigins } from "@/lib/supabase/project-safety";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import flags from "./flags.json";

type Environment = Record<string, string | undefined>;
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

function releaseReaderAuthorized(request: Request, env: Environment) {
  const token = env.HELIX_RELEASE_STATUS_TOKEN;
  if (!token || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) return false;
  const supplied = request.headers.get("authorization") ?? "";
  if (supplied.length > 264) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(supplied), digest("Bearer " + token));
}

export function searchCredentialFingerprints(env: Environment) {
  const fingerprint = (value: string | undefined) => value ? createHash("sha256").update(value, "utf8").digest("hex") : null;
  const signer = catalogWebhookSecret(env, "production");
  if (env.HELIX_PRODUCTION_CATALOG_WEBHOOK_SECRET && !signer) throw new Error("Unbound Catalog webhook signer");
  return {
    writeKeySha256: fingerprint(catalogWriteApiKey(env, "production")),
    webhookSecretSha256: fingerprint(signer),
  };
}

export async function observeProduction(productSlug: string) {
  const env = process.env;
  if (hasLivePaymentConfiguration(env) || (env.CHECKOUT_MODE && env.CHECKOUT_MODE !== "sandbox")) {
    throw new Error("Invalid payment mode for Catalog observation");
  }
  if (runtimeSupabaseTarget() !== "production" || !/^dpl_[A-Za-z0-9]+$/.test(env.VERCEL_DEPLOYMENT_ID ?? "") ||
      !/^[0-9a-f]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA ?? "")) throw new Error("Invalid release context");
  verifyHostedSiteOrigins(env, "production");
  readPublicSupabaseConnection();
  verifyPublicSearchBinding(env, "production");
  if (!await productionDeploymentAuthorized(env)) throw new Error("Unauthorized deployment");
  const searchCredentials = searchCredentialFingerprints(env);
  const searchWrite = searchCredentials.writeKeySha256 !== null;
  if (searchWrite && getIndexName() !== "helix_products") {
    throw new Error("Unbound Search writer");
  }
  // Missing payment credentials are an observable disabled state. A partially configured or enabled
  // sandbox must satisfy the same validation as the real settlement and admission paths.
  const sandboxSettlement = Boolean(env.STRIPE_SECRET_KEY || env.STRIPE_WEBHOOK_SECRET || env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const sandboxCheckout = ["true", "1", "yes"].includes(env.CHECKOUT_ENABLED?.trim() ?? "");
  if (sandboxSettlement) readPaymentProviderConfig(env);
  if (sandboxCheckout) readCheckoutConfig(env);

  const db = createSupabaseAdminClient();
  const { data: database, error } = await db.rpc("read_helix_release_observations").abortSignal(AbortSignal.timeout(4000));
  if (error || database?.environment !== "production" || database.projectRef !== SUPABASE_PROJECT_REFS.production ||
      database.catalogSchema !== true) throw new Error("Unverified database");
  const searchRead = Boolean(env.NEXT_PUBLIC_ALGOLIA_APP_ID);
  if (searchRead) {
    // Probe the same target-bound public search client as the storefront, using a published Catalog slug.
    const { hits } = await searchProducts(productSlug.replaceAll("-", " "), { hitsPerPage: 5 });
    if (!hits.some(hit => hit.slug === productSlug)) throw new Error("Catalog product unavailable in Search");
  }
  const features = Object.fromEntries(Object.entries(flags).map(([name, variable]) => [name, env[variable] === "true"]));
  return {
    version: 1, productSlug, deploymentId: env.VERCEL_DEPLOYMENT_ID, sha: env.VERCEL_GIT_COMMIT_SHA, database, searchCredentials,
    features: {
      ...features, sandboxCheckout, sandboxSettlement, searchRead, searchWrite,
      restrictedEmail: env.HELIX_EMAIL_ENVIRONMENT === "sandbox" && env.HELIX_EMAIL_MODE === "restricted",
      legacyResendSigner: Boolean(env.RESEND_WEBHOOK_SECRET),
      supportIngestConfigured: Boolean(env.HELIX_SUPPORT_INGEST_SECRET),
      supportSentSigner: Boolean(env.HELIX_PRODUCTION_SUPPORT_SENT_WEBHOOK_SECRET),
      ga4: measurementConfig.gaEnabled, meta: measurementConfig.metaEnabled,
      webAnalytics: measurementConfig.webAnalytics, speedInsights: measurementConfig.speedInsights,
    },
  };
}

export async function observeBusinessCheckoutReadiness(env: Environment) {
  const provider = await observeClosedLivePaymentProvider(env);
  if (!provider.chargesEnabled || !provider.payoutsEnabled || !provider.settlementConfigured) return provider;
  const storefront = await readCheckoutStorefront(env);
  return { ...provider, admissionOpen: storefront.mode === "live" && storefront.admissionOpen };
}

export async function serveReleaseStatus(
  request: Request, env: Environment, observe: (productSlug: string) => Promise<unknown>,
  observeCheckout = observeBusinessCheckoutReadiness,
) {
  const url = new URL(request.url);
  const hostAllowed = url.origin === "https://www.helixskin.us" ||
    (env.VERCEL_URL && url.origin === "https://" + env.VERCEL_URL);
  if (!hostAllowed || !releaseReaderAuthorized(request, env) || url.searchParams.size !== 1) {
    return new Response(null, { status: 404, headers });
  }
  try {
    if (url.searchParams.get("checkout") === "1") {
      if (!await productionDeploymentAuthorized(env)) throw new Error("Unauthorized deployment");
      verifyHostedSiteOrigins(env, "production");
      const { providerMode, merchantVerified, chargesEnabled, payoutsEnabled, settlementConfigured, admissionOpen } = await observeCheckout(env);
      return Response.json({
        version: 2, deploymentId: env.VERCEL_DEPLOYMENT_ID, sha: env.VERCEL_GIT_COMMIT_SHA,
        checkout: { providerMode, merchantVerified, chargesEnabled, payoutsEnabled, settlementConfigured, admissionOpen },
      }, { headers });
    }
    const slug = url.searchParams.get("product");
    if (!slug || slug.length > 128 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return new Response(null, { status: 404, headers });
    }
    return Response.json(await observe(slug), { headers });
  } catch { return new Response(null, { status: 503, headers }); }
}
