// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { validateObservations, verifyReleaseObservations } from "../scripts/release/observations.mjs";
import { searchCredentialFingerprints, serveReleaseStatus } from "@/lib/release-observations/status";
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

function fixture(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const json = (value: unknown, status = 200) => Response.json(value, { status });
  const html = (text: string, status = 200) => new Response(text, { status, headers: { "content-type": "text/html" } });
  const produce = () => {
    switch (url.pathname) {
      case "/collections/shop": return url.hostname === "helixskin.us"
        ? new Response(null, { status: 308, headers: { location: canonical + "/collections/shop?release_check=1" } })
        : html('<a href="/products/super-serum">Super Serum</a>');
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
      deploymentId:candidate.id,sha:candidate.sha,expectations:example,statusToken,bypassToken,fetchImpl});
    for (const [input,init] of fetchImpl.mock.calls) {
      const url = new URL(String(input)), headers = new Headers(init?.headers);
      expect(["GET","HEAD"]).toContain(init?.method);
      expect(init?.redirect).toBe("manual");
      expect(headers.get("authorization")).toBe(url.pathname === "/api/internal/release-status" ? "Bearer " + statusToken : null);
      expect(headers.get("x-vercel-protection-bypass")).toBe(url.origin === candidate.url ? bypassToken : null);
    }
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/api/internal/release-status"))).toBe(true);
  });

  it("only skips the authoritative reader for the known legacy artifact and checks each absent route", async () => {
    const fetchImpl = vi.fn((input:RequestInfo | URL, init?:RequestInit) =>
      ["/marketing/production","/api/support/production/intake"].includes(new URL(String(input)).pathname)
        ? Promise.resolve(new Response(null,{status:404})) : fixture(input,init));
    const args = {phase:"previous",origin:canonical, deploymentId:"dpl_91HXTZGJXtUp9P4Us9edBvC73CmC",
      sha:"4d45e0d3e14271513fb887592faadf6c2c24fede",expectations:example,legacyPrevious:true,statusToken,bypassToken,fetchImpl};
    await verifyReleaseObservations(args);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/api/internal/release-status"))).toBe(false);
    await expect(verifyReleaseObservations({...args,sha:candidate.sha})).rejects.toThrow("legacy observation");
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

  it.each(["ALGOLIA_WRITE_API_KEY", "HELIX_PRODUCTION_CATALOG_WEBHOOK_SECRET"])("rejects a nonempty substituted %s even when the qualified public Search is available", async key => {
    const qualified = { ALGOLIA_WRITE_API_KEY:"synthetic-qualified-write-key", HELIX_PRODUCTION_CATALOG_WEBHOOK_SECRET:"synthetic-qualified-production-hook" };
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

  it("treats a failed state reader as unavailable instead of reporting off controls", async () => {
    const observe = vi.fn().mockRejectedValue(new Error("should stay private"));
    const response = await serveReleaseStatus(new Request(canonical + "/api/internal/release-status?product=super-serum",
      {headers:{authorization:"Bearer " + statusToken}}), {HELIX_RELEASE_STATUS_TOKEN:statusToken}, observe);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
    expect(observe).toHaveBeenCalledWith("super-serum");
  });
});
