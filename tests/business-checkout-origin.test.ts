import { describe, expect, it } from "vitest";
import { resolveCheckoutOrigin } from "@/lib/checkout/origin";
import { verifyHostedSiteOrigins } from "@/lib/supabase/project-safety";

const stable = "https://helix-git-codex-558-verified-e87038-brandons-projects-5060bad5.vercel.app";
const historical = "https://helixskin.vercel.app";
const mirror: NodeJS.ProcessEnv = { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "codex/558-verified-dev-preview", VERCEL_PROJECT_ID: "prj_N9nyPL9SixJHOROIovS8PDQ9aKny",
  NEXT_PUBLIC_SUPABASE_URL: "https://zyfkunnpnlmgvrojmrbg.supabase.co", NEXT_PUBLIC_HELIX_SUPABASE_TARGET: "development",
  CHECKOUT_MODE: "business_sandbox", NEXT_PUBLIC_SITE_URL: historical };

describe("isolated business Checkout return origin", () => {
  it("uses the fixed stable mirror independently of historical Auth links", () => {
    expect(resolveCheckoutOrigin({ env: { ...mirror, CHECKOUT_ORIGIN: historical }, requestOrigin: historical })).toBe(stable);
    expect(resolveCheckoutOrigin({ env: mirror, requestOrigin: "https://helixskin-dev-payments.vercel.app" })).toBe(stable);
    expect(() => verifyHostedSiteOrigins({ ...mirror, CHECKOUT_ORIGIN: stable }, "development")).not.toThrow();
    expect(() => verifyHostedSiteOrigins({ ...mirror, HELIX_EMAIL_SITE_ORIGIN: stable }, "development")).toThrow();
  });
  it.each([
    { VERCEL_GIT_COMMIT_REF: "a-feature" }, { VERCEL_PROJECT_ID: "prj_other" }, { VERCEL_ENV: "production" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co" }, { NEXT_PUBLIC_HELIX_SUPABASE_TARGET: "production" },
    { VERCEL_TARGET_ENV: "other" }, { CHECKOUT_ORIGIN: "https://www.helixskin.us" },
  ])("rejects a foreign deployment or origin", fields => {
    expect(() => resolveCheckoutOrigin({ env: { ...mirror, ...fields }, requestOrigin: stable })).toThrow();
  });
  it("pins live checkout to the canonical customer origin", () => {
    expect(resolveCheckoutOrigin({ env: { ...mirror, CHECKOUT_MODE: "live" }, requestOrigin: historical })).toBe("https://www.helixskin.us");
  });
});
