import { describe, expect, it } from "vitest";
import {
  CANONICAL_PUBLIC_SITE_ORIGIN,
  resolvePublicSiteOrigin,
} from "@/lib/site-url";

describe("public-site URL contract", () => {
  it("uses the controlled HTTPS hostname instead of a generated Vercel URL", () => {
    expect(CANONICAL_PUBLIC_SITE_ORIGIN).toBe("https://helixskin.vercel.app");
    expect(
      resolvePublicSiteOrigin({
        env: {
          NODE_ENV: "production",
          VERCEL_URL: "helix-random-build.vercel.app",
        },
      }),
    ).toBe("https://helixskin.vercel.app");
  });

  it.each([
    "http://helixskin.vercel.app",
    "https://helix-random-build.vercel.app",
    "https://helixskin.vercel.app/path",
  ])("ignores a noncanonical deployed site URL: %s", (siteUrl) => {
    expect(
      resolvePublicSiteOrigin({
        env: {
          NODE_ENV: "production",
          NEXT_PUBLIC_SITE_URL: siteUrl,
        },
      }),
    ).toBe("https://helixskin.vercel.app");
  });

  it("accepts only loopback configured and request origins during local development", () => {
    expect(
      resolvePublicSiteOrigin({
        env: {
          NODE_ENV: "development",
          NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
        },
      }),
    ).toBe("http://localhost:3100");
    expect(
      resolvePublicSiteOrigin({
        env: { NODE_ENV: "development" },
        requestOrigin: "http://127.0.0.1:3100",
      }),
    ).toBe("http://127.0.0.1:3100");
    expect(
      resolvePublicSiteOrigin({
        env: { NODE_ENV: "development" },
        requestOrigin: "http://[::1]:3200",
      }),
    ).toBe("http://[::1]:3200");
    expect(
      resolvePublicSiteOrigin({
        env: { NODE_ENV: "development" },
        requestOrigin: "https://attacker.example",
      }),
    ).toBe("http://localhost:3000");
  });
});
