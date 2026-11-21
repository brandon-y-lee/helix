import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertApprovedSupabaseProjectRef, assertApprovedSupabaseProjectUrl, assertSupabaseTargetUrl,
  deploymentSupabaseTarget, projectRefFromSupabaseUrl, SUPABASE_PROJECT_REFS, supabaseOriginForTarget, verifyHostedSiteOrigins,
} from "@/lib/supabase/project-safety";
import { verifySupabaseCredential } from "@/lib/supabase/key-binding";
import { syntheticMainContext, syntheticSupabaseKey } from "./helpers/supabase-target";

const dev = supabaseOriginForTarget("development");
const parent = supabaseOriginForTarget("production");

describe("Supabase target boundaries", () => {
  it("pins routine tools to the development child, independently of their supplied URL", () => {
    expect(projectRefFromSupabaseUrl(dev)).toBe(SUPABASE_PROJECT_REFS.development);
    expect(assertApprovedSupabaseProjectUrl(dev)).toBe(SUPABASE_PROJECT_REFS.development);
    expect(assertApprovedSupabaseProjectRef(SUPABASE_PROJECT_REFS.development)).toBe(SUPABASE_PROJECT_REFS.development);
    expect(() => assertApprovedSupabaseProjectUrl(parent)).toThrow(/target/);
    expect(() => assertApprovedSupabaseProjectRef(SUPABASE_PROJECT_REFS.production)).toThrow(/target/);
    expect(assertSupabaseTargetUrl(parent, "production")).toBe(SUPABASE_PROJECT_REFS.production);
  });

  it.each(["not a URL", "https://example.com", dev.replace("https:", "http:"), dev + ".other.example",
    dev + "/storage", dev + "?ref=x", dev + "#fragment", dev.replace("https://", "https://identity@")])(
    "rejects noncanonical configuration without echoing the supplied URL", (url) => {
      expect(projectRefFromSupabaseUrl(url)).toBeNull();
      expect(() => assertApprovedSupabaseProjectUrl(url)).toThrow("Refusing Supabase target.");
    },
  );

  it("requires the known Vercel project and Git branch before selecting the parent", () => {
    expect(deploymentSupabaseTarget({})).toBe("development");
    expect(deploymentSupabaseTarget({ GITHUB_ACTIONS: "true", GITHUB_REF_NAME: "main" })).toBe("development");
    expect(deploymentSupabaseTarget(syntheticMainContext)).toBe("production");
    const preview = { ...syntheticMainContext, VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "dev" };
    expect(deploymentSupabaseTarget(preview)).toBe("development");
    for (const invalid of [
      { VERCEL_ENV: "production" }, { ...syntheticMainContext, VERCEL_PROJECT_ID: "" },
      { ...syntheticMainContext, VERCEL_GIT_COMMIT_REF: "dev" }, { ...syntheticMainContext, VERCEL_TARGET_ENV: "preview" },
      { ...preview, VERCEL_GIT_COMMIT_REF: "" },
    ]) expect(() => deploymentSupabaseTarget(invalid)).toThrow(/target/);
  });

  it("refuses cross-environment Auth links and checkout returns in hosted builds", () => {
    const devSite = "https://helixskin.vercel.app";
    const publicSite = "https://www.helixskin.us";
    expect(() => verifyHostedSiteOrigins({ ...syntheticMainContext, NEXT_PUBLIC_SITE_URL: publicSite }, "production")).not.toThrow();
    expect(() => verifyHostedSiteOrigins(syntheticMainContext, "production")).toThrow(/origin/);
    for (const key of ["HELIX_EMAIL_SITE_ORIGIN", "CHECKOUT_ORIGIN"]) {
      const env = { ...syntheticMainContext, NEXT_PUBLIC_SITE_URL: publicSite, [key]: devSite };
      expect(() => verifyHostedSiteOrigins(env, "production")).toThrow(/origin/);
    }
    expect(() => verifyHostedSiteOrigins({ VERCEL: "1", VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: publicSite }, "development")).toThrow(/origin/);
  });

  it("validates legacy roles and references and pins opaque key fingerprints to a specific target and role", () => {
    const devKey = syntheticSupabaseKey("development", "service_role");
    expect(() => verifySupabaseCredential(devKey, "development", "service_role", {})).not.toThrow();
    expect(() => verifySupabaseCredential(devKey, "development", "anon", {})).toThrow(/role/);
    expect(() => verifySupabaseCredential(devKey, "production", "service_role", {})).toThrow(/target/);
    const opaque = "sb_publishable_synthetic-public-key";
    const env = { HELIX_DEVELOPMENT_SUPABASE_ANON_KEY_SHA256: createHash("sha256").update(opaque).digest("hex") };
    expect(() => verifySupabaseCredential(opaque, "development", "anon", env)).not.toThrow();
    expect(() => verifySupabaseCredential(opaque, "production", "anon", env)).toThrow(/fingerprint/);
    expect(() => verifySupabaseCredential(opaque, "development", "service_role", env)).toThrow(/role/);
    expect(() => verifySupabaseCredential(opaque + "wrong", "development", "anon", env)).toThrow(/fingerprint/);
  });
});
