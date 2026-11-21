// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { validateObservations, verifyClosedLiveCheckout, verifyReleaseObservations, verifyStorefrontCardOrder } from "../scripts/release/observations.mjs";
import { observeProduction, searchCredentialFingerprints, serveReleaseStatus } from "@/lib/release-observations/status";
import example from "../scripts/release/catalog-observations.example.json";

describe("Catalog release observations", () => {
  it("requires an explicit closed set of approved capabilities", () => {
    expect(() => validateObservations(example)).not.toThrow();
    const incomplete = structuredClone(example);
    Reflect.deleteProperty(incomplete.features, "sandboxCheckout");
    expect(() => validateObservations(incomplete)).toThrow();
    expect(() => validateObservations({ ...example, productSlug: "../cart" })).toThrow();
    expect(() => validateObservations({ ...example, mediaUrl: "https://example.com/image.webp" })).toThrow();
  });

  it("authenticates before querying the database or checking provider configuration", async () => {
    const observe = vi.fn();
    const result = await serveReleaseStatus(new Request("https://www.helixskin.us/api/internal/release-status"),
      { HELIX_RELEASE_STATUS_TOKEN: "a".repeat(48) }, observe);
    expect(result.status).toBe(404);
    expect(observe).not.toHaveBeenCalled();
  });

  it.each([
    ["CHECKOUT_MODE", "live"],
    ["HELIX_STRIPE_LIVE_SECRET_KEY", "incomplete"],
    ["HELIX_STRIPE_LIVE_ACCOUNT_ID", "incomplete"],
    ["HELIX_STRIPE_LIVE_WEBHOOK_SECRET", "incomplete"],
  ])("rejects a live %s in the historical sandbox observation", async (key, value) => {
    vi.stubEnv(key, value);
    try { await expect(observeProduction("super-serum")).rejects.toThrow("Invalid payment mode for Catalog observation"); }
    finally { vi.unstubAllEnvs(); }
  });

  it("refuses to send private release credentials to another origin", async () => {
    const fetchImpl = vi.fn();
    await expect(verifyReleaseObservations({
      phase: "staged", origin: "https://customer-controlled.vercel.app", deploymentId: "dpl_exampleCandidate",
      sha: "a".repeat(40), expectations: example, statusToken: "a".repeat(48), fetchImpl,
    })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

const candidate = { url: "https://helix-123abc456-brandons-projects-5060bad5.vercel.app", id: "dpl_candidate", sha: "a".repeat(40) };
const canonical = "https://www.helixskin.us";
const statusToken = "s".repeat(48), bypassToken = "p".repeat(40);
const publicKey = "sb_publishable_syntheticCatalogRelease";
const catalogEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
  HELIX_PRODUCTION_SUPABASE_ANON_KEY_SHA256: createHash("sha256").update(publicKey).digest("hex"),
};
const closedCheckout = {
  providerMode: "live", merchantVerified: true, chargesEnabled: false, payoutsEnabled: false,
  settlementConfigured: true, admissionOpen: false,
} as const;

describe("authenticated closed live Checkout observation", () => {
  const env = {
    ...catalogEnv, VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: "prj_N9nyPL9SixJHOROIovS8PDQ9aKny",
    VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_COMMIT_SHA: candidate.sha, VERCEL_DEPLOYMENT_ID: candidate.id,
    VERCEL_URL: new URL(candidate.url).hostname, CHECKOUT_MODE: "live",
    NEXT_PUBLIC_SITE_URL: canonical, NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co",
    HELIX_RELEASE_STATUS_TOKEN: statusToken,
  };
  const request = (url: string, token = statusToken) =>
    new Request(url, { headers: { authorization: "Bearer " + token } });
  const path = "/api/internal/release-status?checkout=1";
  const args = { origin: candidate.url, deploymentId: candidate.id, sha: candidate.sha, statusToken, bypassToken };

  it.each([true, false])("binds the verified merchant, settlementConfigured=%s and closed admission to the build", async settlementConfigured => {
    const catalog = vi.fn();
    const checkout = { ...closedCheckout, settlementConfigured, chargesEnabled: settlementConfigured, payoutsEnabled: !settlementConfigured };
    const provider = vi.fn().mockResolvedValue({ ...checkout, privateDetail: "hidden" });
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      serveReleaseStatus(new Request(url, init), env, catalog, provider));
    const result = await verifyClosedLiveCheckout({ ...args, fetchImpl });
    expect(result).toEqual({ version: 2, deploymentId: candidate.id, sha: candidate.sha, checkout });
    expect(catalog).not.toHaveBeenCalled();
    expect(provider).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toBe(candidate.url + path);
    const init = fetchImpl.mock.calls[0][1];
    expect(new Headers(init?.headers).get("x-vercel-protection-bypass")).toBe(bypassToken);
    expect(init).toMatchObject({ method: "GET", redirect: "manual", credentials: "omit" });
  });

  it("rejects the wrong token, origin or query before any observer runs", async () => {
    const observer = vi.fn();
    for (const invalid of [
      request(canonical + path, "wrong"), request("https://untrusted.example" + path),
      request(canonical + path + "&product=super-serum"), request(canonical + path + "&checkout=1"),
      request(canonical + "/api/internal/release-status?checkout=2"),
    ]) {
      expect((await serveReleaseStatus(invalid, env, observer, observer)).status).toBe(404);
    }
    expect(observer).not.toHaveBeenCalled();
  });

  it("sends only the release reader credential to the canonical application", async () => {
    const provider = vi.fn().mockResolvedValue(closedCheckout);
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      serveReleaseStatus(new Request(url, init), env, vi.fn(), provider));
    await verifyClosedLiveCheckout({ ...args, origin: canonical, expectedSettlementConfigured: true, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(canonical + path);
    expect(Object.fromEntries(new Headers(init?.headers))).toEqual({ authorization: "Bearer " + statusToken });
  });

  it("returns an empty failure on the wrong deployment or failed merchant qualification", async () => {
    const provider = vi.fn().mockRejectedValue(new Error("private provider error"));
    const invalidEnv = { ...env, VERCEL_ENV: "preview" };
    const req = request(canonical + path);
    expect((await serveReleaseStatus(req, invalidEnv, vi.fn(), provider)).status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
    const result = await serveReleaseStatus(req, env, vi.fn(), provider);
    expect(result.status).toBe(503);
    expect(await result.text()).toBe("");
    expect(result.headers.get("cache-control")).toBe("private, no-store");
  });

  it("refuses unrelated hosts and rejects a changed build, open admission, extra fields or oversized data", async () => {
    const observations = { version: 2, deploymentId: candidate.id, sha: candidate.sha, checkout: closedCheckout };
    const fetchImpl = vi.fn();
    await expect(verifyClosedLiveCheckout({ ...args, origin: "https://untrusted.example", fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
    for (const invalid of [
      { ...observations, sha: "b".repeat(40) },
      { ...observations, checkout: { ...closedCheckout, admissionOpen: true } },
      { ...observations, checkout: { ...closedCheckout, settlementConfigured: "false" } },
      { ...observations, checkout: { ...closedCheckout, chargesEnabled: null } },
      { ...observations, checkout: { ...closedCheckout, payoutsEnabled: "false" } },
      { ...observations, checkout: { ...closedCheckout, extra: "undisclosed" } },
      { ...observations, extra: "x".repeat(9000) },
    ]) {
      fetchImpl.mockResolvedValueOnce(Response.json(invalid));
      await expect(verifyClosedLiveCheckout({ ...args, fetchImpl })).rejects.toThrow();
    }
    fetchImpl.mockResolvedValueOnce(Response.json({ ...observations, checkout: { ...closedCheckout, settlementConfigured: false } }));
    await expect(verifyClosedLiveCheckout({ ...args, fetchImpl, expectedSettlementConfigured: true })).rejects.toThrow();
  });
});
const publicRows = [
  {slug:"peptide-eye-cream",sort_order:2,product_family_memberships:[]},
  {slug:"super-serum",sort_order:2,product_family_memberships:[{is_entry:true}]},
  {slug:"other-variant",sort_order:3,product_family_memberships:[{is_entry:false}]},
];
const cardLinks = (slugs: string[]) => slugs.map(slug => `<a class="product-card__link" href="/products/${slug}"></a>`).join("");

function fixture(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const json = (value: unknown, status = 200) => Response.json(value, { status });
  const html = (text: string, status = 200) => new Response(text, { status, headers: { "content-type": "text/html" } });
  const produce = () => {
    switch (url.pathname) {
      case "/collections/shop": return url.hostname === "helixskin.us"
        ? new Response(null, { status: 308, headers: { location: canonical + "/collections/shop?release_check=1" } })
        : html(cardLinks(["peptide-eye-cream","super-serum"]));
      case "/rest/v1/products": return Response.json(publicRows, {headers:{"content-range":"0-2/3"}});
      case "/products/super-serum": return html('<link rel="canonical" href="https://www.helixskin.us/products/super-serum" /><img src="' + example.mediaUrl + '">');
      case "/auth/confirm": return method === "HEAD" ? new Response(null, { headers: { "cache-control":"private,no-store","referrer-policy":"no-referrer" } }) : html("Invalid email link",400);
      case "/account": case "/admin": return new Response(null,{status:307,headers:{location:"/account/sign-in?next=" + encodeURIComponent(url.pathname)}});
      case "/auth/callback": return new Response(null,{status:307,headers:{location:canonical+"/account/sign-in?error=invalid-link"}});
      case "/contact": return html("Contact");
      case "/account/sign-in": return html("Sign in");
      case "/api/cart": return json({lines:[],count:0,subtotal:0});
      case "/api/rewards/summary": return json({authenticated:false,referralCode:null,recentLedger:[]});
      case "/api/webhooks/stripe": return json({ok:true,endpoint:"stripe"});
      case "/api/checkout/sessions": return new Response(null,{status: url.origin === canonical ? 405 : 403});
      case "/api/internal/release-status": return json({version:1,productSlug:example.productSlug,deploymentId:candidate.id,
        sha:candidate.sha,features:example.features,database:example.database,searchCredentials:example.searchCredentials});
      case "/marketing/production": return html("<fieldset disabled>New email enrollment is paused.</fieldset>");
      case "/api/marketing/readiness": return json({ready:false});
      case "/api/reviews": return json({reviews:[],count:0});
      case "/api/support/intake": return json({available:false,photosAvailable:false});
      case "/api/support/production/intake": return json({available:false,photosAvailable:false});
      case "/api/internal/marketing/production/status": return json({ok:false},503);
      default: {
        if (url.href !== example.mediaUrl) throw new Error("unexpected request");
        const bytes = Buffer.alloc(32);
        bytes.write("RIFF",0); bytes.write("WEBP",8); bytes.write("VP8 ",12);
        return new Response(bytes, {status:206,headers:{"cache-control":"public, max-age=3600", "content-type":"image/webp","content-range":"bytes 0-31/1452","content-length":"32"}});
      }
    }
  };
  return Promise.resolve(produce());
}

describe("production release read-only probe", () => {
  it.each(["staged","canonical","previous"])("verifies %s without giving a media server or redirect host application credentials", async phase => {
    const fetchImpl = vi.fn(fixture);
    await verifyReleaseObservations({phase,origin:phase === "staged" ? candidate.url : canonical,
      deploymentId:candidate.id,sha:candidate.sha,expectations:example,statusToken,bypassToken,fetchImpl,env:catalogEnv});
    for (const [input,init] of fetchImpl.mock.calls) {
      const url = new URL(String(input)), headers = new Headers(init?.headers);
      expect(["GET","HEAD"]).toContain(init?.method);
      expect(init?.redirect).toBe("manual");
      expect(headers.get("authorization")).toBe(url.pathname === "/api/internal/release-status" ? "Bearer " + statusToken : null);
      expect(headers.get("x-vercel-protection-bypass")).toBe(url.origin === candidate.url ? bypassToken : null);
      expect(headers.get("apikey")).toBe(url.origin === "https://erasogmsqpgiirovubjh.supabase.co" && url.pathname === "/rest/v1/products" ? publicKey : null);
    }
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/api/internal/release-status"))).toBe(true);
  });

  it("only skips the authoritative reader for the known legacy artifact and checks each absent route", async () => {
    const fetchImpl = vi.fn((input:RequestInfo | URL, init?:RequestInit) =>
      ["/marketing/production","/api/support/production/intake"].includes(new URL(String(input)).pathname)
        ? Promise.resolve(new Response(null,{status:404})) : fixture(input,init));
    const args = {phase:"previous",origin:canonical, deploymentId:"dpl_91HXTZGJXtUp9P4Us9edBvC73CmC",
      sha:"4d45e0d3e14271513fb887592faadf6c2c24fede",expectations:example,legacyPrevious:true,statusToken,bypassToken,fetchImpl,env:catalogEnv};
    await verifyReleaseObservations(args);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/api/internal/release-status"))).toBe(false);
    await expect(verifyReleaseObservations({...args,sha:candidate.sha})).rejects.toThrow("legacy observation");
  });

  it("runs every original public probe for bounded evidence only on the serving original build", async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      ["/marketing/production", "/api/support/production/intake"].includes(new URL(String(input)).pathname)
        ? Promise.resolve(new Response(null, {status: 404})) : fixture(input, init));
    const original = { phase: "previous", origin: canonical, deploymentId: "dpl_91HXTZGJXtUp9P4Us9edBvC73CmC",
      sha: "4d45e0d3e14271513fb887592faadf6c2c24fede", expectations: example, legacyPrevious: true,
      statusToken, bypassToken, fetchImpl, env: catalogEnv };
    await verifyReleaseObservations(original);
    const paths = () => fetchImpl.mock.calls.map(([input, options]) => [String(input), options?.method]);
    const normalLegacyProbes = paths();
    fetchImpl.mockClear();
    const limited = { ...original, inspectionOnly: true, expectations: {
      productSlug: example.productSlug, mediaUrl: example.mediaUrl, canonicalCheckoutGet: example.canonicalCheckoutGet,
    } };
    await verifyReleaseObservations(limited);
    expect(paths()).toEqual(normalLegacyProbes);
    for (const [, options] of fetchImpl.mock.calls) {
      const headers = new Headers(options?.headers);
      expect(headers.has("x-vercel-protection-bypass")).toBe(false);
      expect(headers.get("authorization")).not.toBe("Bearer " + statusToken);
    }
    fetchImpl.mockClear();
    for (const override of [{ phase: "staged" }, { origin: candidate.url }, { legacyPrevious: false }, { sha: candidate.sha }]) {
      await expect(verifyReleaseObservations({ ...limited, ...override })).rejects.toThrow();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a missing planned capability, including when the staged storefront is otherwise available", async () => {
    const fetchImpl = vi.fn(async (input:RequestInfo | URL, init?:RequestInit) => {
      const response = await fixture(input,init);
      if (!String(input).includes("/api/internal/release-status")) return response;
      const body = await response.json();
      body.features.searchRead = false;
      return Response.json(body);
    });
    await expect(verifyReleaseObservations({phase:"staged",origin:candidate.url,deploymentId:candidate.id,
      sha:candidate.sha,expectations:example,statusToken,bypassToken,fetchImpl})).rejects.toThrow("features differ");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(["HELIX_PRODUCTION_ALGOLIA_WRITE_API_KEY", "HELIX_PRODUCTION_CATALOG_WEBHOOK_SECRET"])("rejects a nonempty substituted %s even when the qualified public Search is available", async key => {
    const qualified = { HELIX_PRODUCTION_ALGOLIA_WRITE_API_KEY:"synthetic-qualified-write-key", HELIX_PRODUCTION_CATALOG_WEBHOOK_SECRET:"synthetic-qualified-production-hook" };
    expect(searchCredentialFingerprints(qualified)).toEqual(example.searchCredentials);
    const actual = searchCredentialFingerprints({...qualified, [key]:"synthetic-unqualified-replacement"});
    const fetchImpl = vi.fn(async (input:RequestInfo | URL, init?:RequestInit) => {
      const response = await fixture(input,init);
      if (!String(input).includes("/api/internal/release-status")) return response;
      return Response.json({...await response.json(), searchCredentials:actual});
    });
    await expect(verifyReleaseObservations({phase:"staged",origin:candidate.url,deploymentId:candidate.id,
      sha:candidate.sha,expectations:example,statusToken,bypassToken,fetchImpl})).rejects.toThrow("credential bindings");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a partial Catalog page that returned 200 without the expected Product card", async () => {
    const fetchImpl = vi.fn((input:RequestInfo | URL, init?:RequestInit) => new URL(String(input)).pathname === "/collections/shop"
      ? Promise.resolve(new Response("<html>Temporarily unavailable</html>",{headers:{"content-type":"text/html"}})) : fixture(input,init));
    await expect(verifyReleaseObservations({phase:"staged",origin:candidate.url,deploymentId:candidate.id,sha:candidate.sha,
      expectations:example,statusToken,bypassToken,fetchImpl})).rejects.toThrow("Catalog card missing");
  });

  it("checks actual card links against all visible anonymous rows, including the UUID tie-breaker", async () => {
    const fetchImpl = vi.fn(fixture);
    const args = {target:"production",env:catalogEnv,fetchImpl};
    const reversed = cardLinks(["super-serum","peptide-eye-cream"]);
    await expect(verifyStorefrontCardOrder({...args,html:reversed})).rejects.toThrow("Catalog card order");
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.searchParams.get("order")).toBe("sort_order.asc,id.asc");
    expect(url.searchParams.get("catalog_status")).toBe("eq.active");
    await verifyStorefrontCardOrder({...args,html:reversed,legacyPrevious:true});
    await expect(verifyStorefrontCardOrder({...args,html:cardLinks(["super-serum","super-serum"]),legacyPrevious:true})).rejects.toThrow("Catalog card order");
    await expect(verifyStorefrontCardOrder({...args,html:reversed,fetchImpl:async () => Response.json(publicRows,{headers:{"content-range":"0-2/4"}})})).rejects.toThrow("incomplete Catalog");
    await expect(verifyStorefrontCardOrder({...args,html:reversed,target:"development"})).rejects.toThrow("fingerprint");
  });

  it("treats a failed state reader as unavailable instead of reporting off controls", async () => {
    const observe = vi.fn().mockRejectedValue(new Error("should stay private"));
    const response = await serveReleaseStatus(new Request(canonical + "/api/internal/release-status?product=super-serum",
      {headers:{authorization:"Bearer " + statusToken}}), {HELIX_RELEASE_STATUS_TOKEN:statusToken}, observe);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
    expect(observe).toHaveBeenCalledWith("super-serum");
  });
});
