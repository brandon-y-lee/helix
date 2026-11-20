import { isDeepStrictEqual } from "node:util";
import flags from "../../lib/release-observations/flags.json" with { type: "json" };

const canonical = "https://www.helixskin.us";
const apex = "https://helixskin.us";
const parent = "erasogmsqpgiirovubjh";
const mediaOrigin = "https://" + parent + ".supabase.co";
const mediaPrefix = "/storage/v1/object/public/helix-catalog/products/";
const immutable = /^https:\/\/helix-[a-z0-9]+-brandons-projects-5060bad5\.vercel\.app$/;
const allowedToken = /^[A-Za-z0-9_-]{32,256}$/;

function requireValue(ok, message) {
  if (!ok) throw new Error("Release observation failed: " + message);
}

function exactKeys(value, names) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    isDeepStrictEqual(Object.keys(value).sort(), [...names].sort());
}

const featureNames = [...Object.keys(flags), "sandboxSettlement", "sandboxCheckout", "searchRead", "searchWrite",
  "restrictedEmail", "legacyResendSigner", "supportIngestConfigured", "supportSentSigner", "ga4", "meta",
  "webAnalytics", "speedInsights"];
const catalogTrialOff = ["supportAdmission", "supportWorker", "supportMediaQualified", "supportIsolationQualified",
  "supportOperationsQualified", "welcomeEnrollment", "welcomeDispatch", "welcomeEvents", "welcomeStatus", "productionEmailGateway",
  "legacySupportAdmission", "legacySupportPhotos", "legacySupportAi", "legacyDispatch", "legacyMarketing", "marketingSync",
  "lifecycle", "lifecycleCampaigns", "lifecycleReviews", "offers", "publicReviews", "guestReviews",
  "manualShipments", "orderSimulation", "bulkSearchReindex"];

export function validateObservations(e) {
  requireValue(exactKeys(e, ["version","productSlug","mediaUrl","features","database","searchCredentials","canonicalCheckoutGet","stagedCheckoutGet"]) &&
    e.version === 1 && typeof e.productSlug === "string" && e.productSlug.length <= 128 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.productSlug), "invalid Catalog expectations");
  requireValue(typeof e.mediaUrl === "string" && e.mediaUrl.length < 1024 &&
    e.mediaUrl.startsWith(mediaOrigin + mediaPrefix) &&
    /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+\.(?:webp|png|jpg|jpeg)$/.test(e.mediaUrl.slice((mediaOrigin + mediaPrefix).length)),
    "expected governed product image");
  requireValue(exactKeys(e.features, featureNames) && featureNames.every(k => typeof e.features[k] === "boolean") &&
    catalogTrialOff.every(k => e.features[k] === false) &&
    (!e.features.sandboxCheckout || e.features.sandboxSettlement), "invalid or unapproved feature state");
  const credentials = e.searchCredentials;
  requireValue(exactKeys(credentials, ["writeKeySha256", "webhookSecretSha256"]) &&
    Object.values(credentials).every(value => value === null || (typeof value === "string" && /^[a-f0-9]{64}$/.test(value))) &&
    e.features.searchWrite === (credentials.writeKeySha256 !== null) &&
    (!e.features.searchWrite || credentials.webhookSecretSha256 !== null), "invalid qualified Search credentials");
  const db = e.database;
  requireValue(exactKeys(db, ["environment","projectRef","catalogSchema","support","marketing","waitlist"]) &&
    db.environment === "production" && db.projectRef === parent && db.catalogSchema === true &&
    typeof db.waitlist === "boolean", "invalid database expectations");
  if (db.support !== null) requireValue(exactKeys(db.support, ["admission","worker","mediaQualified","isolationQualified","operationsQualified"])
    && Object.values(db.support).every(value => value === false), "unexpected production support controls");
  if (db.marketing !== null) requireValue((exactKeys(db.marketing, ["enrollment","dispatch"]) ||
    exactKeys(db.marketing, ["enrollment","dispatch","events","status"])) &&
    Object.values(db.marketing).every(value => value === false), "unexpected marketing controls");
  requireValue([403,405].includes(e.canonicalCheckoutGet) && [403,405].includes(e.stagedCheckoutGet), "invalid sandbox admission boundary");
  return e;
}

async function boundedBytes(response, max) {
  requireValue(response.body, "response has no body");
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      requireValue(size <= max, "response exceeds byte limit");
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function verifyCanonicalRedirect({ fetchImpl = fetch } = {}) {
  const path = "/collections/shop?release_check=1";
  const resp = await fetchImpl(apex + path, { method: "HEAD", cache: "no-store", redirect: "manual",
    credentials: "omit", signal: AbortSignal.timeout(8000) });
  try { requireValue(resp.status === 308 && resp.headers.get("location") === canonical + path, "canonical apex redirect"); }
  finally { await resp.body?.cancel(); }
}

export async function verifyReleaseObservations({ phase, origin, deploymentId, sha, expectations, legacyPrevious = false, statusToken, bypassToken = "", fetchImpl = fetch }) {
  const e = validateObservations(expectations);
  requireValue(["previous", "staged", "canonical"].includes(phase) &&
    (phase === "canonical" ? origin === canonical : phase === "staged" ? immutable.test(origin) : (origin === canonical || immutable.test(origin))) &&
    /^dpl_[A-Za-z0-9]+$/.test(deploymentId) && /^[0-9a-f]{40}$/.test(sha), "untrusted deployment");
  const isPublic = origin === canonical;
  const headers = !isPublic && bypassToken ? { "x-vercel-protection-bypass": bypassToken } : {};
  async function read(path, status, kind, options = {}) {
    const resp = await fetchImpl(origin + path, { method: options.method ?? "GET",
      headers: { ...headers, ...options.headers }, redirect: "manual", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(10000) });
    try {
      requireValue(resp.status === status, "unexpected response at " + path);
      if (kind === "headers") return resp.headers;
      const type = resp.headers.get("content-type") ?? "";
      requireValue(type.includes(kind === "json" ? "application/json" : "text/html"), "unexpected representation at " + path);
      const text = (await boundedBytes(resp, kind === "json" ? 32768 : 2 * 1024 * 1024)).toString("utf8");
      if (kind !== "json") return text;
      try { return JSON.parse(text); } catch { throw new Error("Malformed release observation at " + path); }
    } finally { if (!resp.bodyUsed) await resp.body?.cancel(); }
  }

  requireValue(!legacyPrevious || (phase === "previous" && deploymentId === "dpl_91HXTZGJXtUp9P4Us9edBvC73CmC" &&
    sha === "4d45e0d3e14271513fb887592faadf6c2c24fede"), "invalid legacy observation exception");
  if (!legacyPrevious) {
    requireValue(typeof statusToken === "string" && allowedToken.test(statusToken), "missing release status credential");
    const status = await read("/api/internal/release-status?product=" + e.productSlug, 200, "json", { headers: { authorization: "Bearer " + statusToken } });
    requireValue(isDeepStrictEqual(status, { version: 1, productSlug: e.productSlug, deploymentId, sha, database: e.database, features: e.features, searchCredentials: e.searchCredentials }),
      "effective release identity, database, credential bindings or features differ");
  }
  // No cookies or customer identifiers are sent. These GETs never call the worker or admission POST handlers.
  const collection = await read("/collections/shop", 200, "html");
  requireValue(collection.includes("/products/" + e.productSlug), "Catalog card missing");
  const product = await read("/products/" + e.productSlug, 200, "html");
  requireValue(product.includes(e.mediaUrl) || product.includes(encodeURIComponent(e.mediaUrl)), "governed Catalog image missing");
  requireValue(product.includes('rel="canonical" href="' + canonical + "/products/" + e.productSlug + '"'), "PDP canonical identity");
  requireValue(!product.includes("pk_live_"), "live payment configuration rendered");

  const { tsImport } = await import("tsx/esm/api");
  const { verifyRealProductMedia } = await tsImport("../../lib/catalog/real-product-media-verification.ts", import.meta.url);
  const { createBoundedProductMediaHttpClient } = await tsImport("../../lib/catalog/product-media-http-client.ts", import.meta.url);
  const media = await verifyRealProductMedia({
    expectedMedia: [{ url: e.mediaUrl, mediaType: "image" }],
    httpClient: createBoundedProductMediaHttpClient(fetchImpl),
    urlPolicy: { approvedLocations: [{ origin: mediaOrigin, pathPrefix: mediaPrefix }], maxRedirects: 0, timeoutMs: 8000 },
  });
  requireValue(media.summary.successes === 1, "bounded Catalog image check (" + (media.results[0]?.failure?.code ?? "missing") + ")");
  const authHeaders = await read("/auth/confirm",200,"headers",{method:"HEAD"});
  requireValue(authHeaders.get("cache-control")?.includes("no-store") && authHeaders.get("referrer-policy") === "no-referrer", "Auth confirmation privacy");
  await read("/auth/confirm", 400, "html");
  await read("/account/sign-in",200,"html");
  await read("/contact",200,"html");
  for (const path of ["/account", "/admin"]) {
    const account = await read(path,307,"headers");
    const redirect = new URL(account.get("location") ?? "/", origin);
    requireValue([origin,canonical].includes(redirect.origin) && redirect.pathname === "/account/sign-in" && redirect.searchParams.get("next")===path,
      "anonymous gate for " + path);
  }
  if (isPublic) {
    const auth = await read("/auth/callback",307,"headers");
    const location = new URL(auth.get("location") ?? "/", origin);
    requireValue(location.href === canonical + "/account/sign-in?error=invalid-link", "token-free Auth callback");
  }
  const cart = await read("/api/cart",200,"json");
  requireValue(Array.isArray(cart.lines) && cart.lines.length === 0 && cart.count === 0 && cart.subtotal === 0, "anonymous Cart");
  const rewards = await read("/api/rewards/summary",200,"json");
  requireValue(rewards.authenticated === false && rewards.referralCode === null && rewards.recentLedger?.length === 0,
    "anonymous Rewards access");
  const stripe = await read("/api/webhooks/stripe",200,"json");
  requireValue(stripe.ok === true && stripe.endpoint === "stripe","Stripe webhook read route");
  await read("/api/checkout/sessions", isPublic ? e.canonicalCheckoutGet : e.stagedCheckoutGet, "headers");

  const lifecycle = await read("/api/marketing/readiness",200,"json");
  requireValue(lifecycle.ready === false,"lifecycle signup enabled");
  if (legacyPrevious) {
    await read("/api/support/production/intake",404,"headers");
    await read("/marketing/production",404,"headers");
  } else {
    const contact = await read("/api/support/production/intake",200,"json");
    requireValue(isDeepStrictEqual(contact, {available:false,photosAvailable:false}), "production Contact unavailable");
    const welcome = await read("/marketing/production",200,"html");
    requireValue(welcome.includes("New email enrollment is paused.") && /<fieldset\s+disabled>/.test(welcome), "welcome enrollment enabled");
    const reviews = await read("/api/reviews?slug=" + e.productSlug,200,"json");
    requireValue(reviews.count === 0 && Array.isArray(reviews.reviews) && reviews.reviews.length === 0, "public reviews");
    if (isPublic) {
      const legacyContact = await read("/api/support/intake",200,"json");
      requireValue(legacyContact.available === false && legacyContact.photosAvailable === false, "legacy Contact disabled");
      await read("/api/internal/marketing/production/status",503,"json");
    }
  }
  if (isPublic) await verifyCanonicalRedirect({fetchImpl});
}
