import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/verification/artifact/route";
import { fingerprintPublicConfiguration } from "@/scripts/github/verification-fingerprints";

const original = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  Object.assign(process.env, original);
});

describe("staged verification artifact identity", () => {
  it("serves build, source, runtime, and actual non-secret configuration identity without caching", async () => {
    Object.assign(process.env, {
      MEI_PELLE_VERIFICATION_BUILD_ID: "build-57",
      MEI_PELLE_VERIFICATION_RUNTIME_FINGERPRINT: `sha256:${"1".repeat(64)}`,
      MEI_PELLE_VERIFICATION_SOURCE_SHA: "c".repeat(40),
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    });

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      buildId: "build-57",
      candidateSha: "c".repeat(40),
      configurationFingerprint: fingerprintPublicConfiguration(process.env),
      runtimeFingerprint: `sha256:${"1".repeat(64)}`,
    });
  });

  it("fails closed outside a controlled staged build", async () => {
    delete process.env.MEI_PELLE_VERIFICATION_BUILD_ID;
    delete process.env.MEI_PELLE_VERIFICATION_RUNTIME_FINGERPRINT;
    delete process.env.MEI_PELLE_VERIFICATION_SOURCE_SHA;

    expect(GET().status).toBe(404);
  });
});
