import { NextResponse } from "next/server";

import { fingerprintPublicConfiguration } from "@/scripts/github/verification-fingerprints";

export const dynamic = "force-dynamic";

export function GET() {
  const buildId = process.env.MEI_PELLE_VERIFICATION_BUILD_ID?.trim();
  const candidateSha = process.env.MEI_PELLE_VERIFICATION_SOURCE_SHA?.trim();
  const runtimeFingerprint = process.env.MEI_PELLE_VERIFICATION_RUNTIME_FINGERPRINT?.trim();
  if (!buildId || !candidateSha || !runtimeFingerprint) {
    return NextResponse.json({ error: "Verification artifact identity unavailable." }, {
      headers: { "Cache-Control": "private, no-store" },
      status: 404,
    });
  }
  return NextResponse.json({
    buildId,
    candidateSha,
    configurationFingerprint: fingerprintPublicConfiguration(process.env),
    runtimeFingerprint,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
