import { createHash } from "node:crypto";
import profileExample from "../../scripts/release/catalog-profile.example.json";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

type LegacyEvidence = {
  deploymentId: string;
  sha: string;
  protectedValues: { observedAt: string; expiresAt: string; evidenceSha256: string; unobservable: string[]; sha256: string };
};
export function bindProtectedValues(legacy: LegacyEvidence) {
  const { observedAt, expiresAt, evidenceSha256, unobservable } = legacy.protectedValues;
  legacy.protectedValues.sha256 = digest(JSON.stringify([
    legacy.deploymentId, legacy.sha, observedAt, expiresAt, evidenceSha256, unobservable,
  ]));
}
export function inspectionProfile() {
  const { observations, evidence, legacyPrevious: original } = structuredClone(profileExample);
  const { productSlug, mediaUrl, canonicalCheckoutGet } = original.observations;
  const legacyPrevious = {
    deploymentId: original.deploymentId,
    sha: original.sha,
    observation: { ...original.observation },
    publicObservations: { productSlug, mediaUrl, canonicalCheckoutGet },
    protectedValues: {
      observedAt: original.observation.observedAt,
      expiresAt: "2026-11-20T02:10:00.000Z",
      evidenceSha256: digest("independent protected inspection"),
      unobservable: [
        "features.bulkSearchReindex", "features.searchWrite",
        "searchCredentials.webhookSecretSha256", "searchCredentials.writeKeySha256",
      ],
      sha256: "",
    },
  };
  bindProtectedValues(legacyPrevious);
  return {
    version: 2, mode: "inspection-only", evidence, legacyPrevious,
    observations: {
      ...observations,
      features: { ...observations.features, searchWrite: false },
      searchCredentials: { writeKeySha256: null as string | null, webhookSecretSha256: null as string | null },
    },
  };
}
