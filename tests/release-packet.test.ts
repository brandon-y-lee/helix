import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import profileExample from "../scripts/release/catalog-profile.example.json";
import { buildReleasePacket, observationsFor, readReleaseProfile, verifyReleasePacket } from "../scripts/release/packet.mjs";
import { bindProtectedValues, inspectionProfile } from "./fixtures/inspection-release-profile";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const release = { candidateId: "dpl_new", candidateSha: "b".repeat(40), previousId: "dpl_old", previousSha: "a".repeat(40) };
const at = Date.parse("2026-11-20T02:00:00Z");
const makeProfile = () => structuredClone(profileExample);
const raw = JSON.stringify(profileExample, null, 2) + "\n";

const original = profileExample.legacyPrevious;
const pinned = { ...release, previousId: original.deploymentId, previousSha: original.sha };

describe("inspection-only release packet", () => {
  it("selects public observations for the pinned original and complete expectations for the staged candidate", () => {
    const source = inspectionProfile();
    const packet = buildReleasePacket(JSON.stringify(source), pinned, at);
    const verified = verifyReleasePacket(packet.raw, packet.digest, pinned, at);
    expect(observationsFor(verified, pinned, "previous", at)).toEqual({
      expectations: source.legacyPrevious.publicObservations, legacyPrevious: true, inspectionOnly: true,
    });
    expect(observationsFor(verified, pinned, "staged", at)).toMatchObject({
      expectations: source.observations, legacyPrevious: false,
    });
    expect(() => observationsFor(verified, pinned, "canonical", at)).toThrow();
  });

  it("requires a protected evidence digest independently sourced from the public check and bound to the receipt", () => {
    const source = inspectionProfile();
    const legacy = source.legacyPrevious;
    legacy.protectedValues.evidenceSha256 = digest("different protected source");
    expect(() => buildReleasePacket(JSON.stringify(source), pinned, at)).toThrow();

    legacy.protectedValues.evidenceSha256 = legacy.observation.sha256;
    bindProtectedValues(legacy);
    expect(() => buildReleasePacket(JSON.stringify(source), pinned, at)).toThrow();
  });

  it.each(["observation", "protectedValues"] as const)("rechecks the original %s expiry at verification", (kind) => {
    const source = inspectionProfile();
    const expiresAt = "2026-11-20T02:05:00.000Z";
    source.legacyPrevious[kind].expiresAt = expiresAt;
    bindProtectedValues(source.legacyPrevious);
    const packet = buildReleasePacket(JSON.stringify(source), pinned, at);
    expect(() => verifyReleasePacket(packet.raw, packet.digest, pinned, Date.parse(expiresAt))).toThrow();
  });

  it.each([
    ["another deployment", { ...pinned, previousId: release.previousId }],
    ["another commit", { ...pinned, previousSha: release.previousSha }],
  ] as const)("refuses an inspection pair with %s even when selecting staged observations", (_, other) => {
    const source = inspectionProfile();
    const profile = readReleaseProfile(JSON.stringify(source), at);
    expect(() => observationsFor(profile, other, "staged", at)).toThrow();
    expect(() => buildReleasePacket(JSON.stringify(source), other, at)).toThrow();

    source.legacyPrevious.deploymentId = other.previousId;
    source.legacyPrevious.sha = other.previousSha;
    bindProtectedValues(source.legacyPrevious);
    expect(() => readReleaseProfile(JSON.stringify(source), at)).toThrow();
  });

  it("requires exactly the four unobservable protected paths even with a recomputed binding", () => {
    for (const change of ["omit", "extend", "duplicate"] as const) {
      const source = inspectionProfile();
      const fields = source.legacyPrevious.protectedValues.unobservable;
      if (change === "omit") fields.pop();
      if (change === "extend") fields.push("features.ga4");
      if (change === "duplicate") fields[0] = fields[1];
      bindProtectedValues(source.legacyPrevious);
      expect(() => buildReleasePacket(JSON.stringify(source), pinned, at), change).toThrow();
    }
  });

  it("refuses incomplete public observations, candidate signals and independent provider attestations", () => {
    const missingPublic = inspectionProfile();
    Reflect.deleteProperty(missingPublic.legacyPrevious.publicObservations, "mediaUrl");
    expect(() => readReleaseProfile(JSON.stringify(missingPublic), at)).toThrow();
    const claimedPublicFlag = inspectionProfile();
    Object.assign(claimedPublicFlag.legacyPrevious.publicObservations, { "features.searchWrite": false });
    expect(() => readReleaseProfile(JSON.stringify(claimedPublicFlag), at)).toThrow();
    const missingCandidate = inspectionProfile();
    Reflect.deleteProperty(missingCandidate.observations.features, "searchWrite");
    expect(() => readReleaseProfile(JSON.stringify(missingCandidate), at)).toThrow();
    const missingEvidence = inspectionProfile();
    Reflect.deleteProperty(missingEvidence.evidence, "searchWriters");
    expect(() => readReleaseProfile(JSON.stringify(missingEvidence), at)).toThrow();
  });

  it("refuses inspection mode with an ordinary previous build and keeps normal prior expectations complete", () => {
    const source = inspectionProfile();
    expect(() => buildReleasePacket(JSON.stringify(source), release, at)).toThrow();
    expect(() => buildReleasePacket(JSON.stringify({ ...source, previous: "same" }), pinned, at)).toThrow();
    const normal = { ...makeProfile(), previous: source.legacyPrevious.publicObservations };
    expect(() => buildReleasePacket(JSON.stringify(normal), release, at)).toThrow();
  });

  it("requires the inspected staged candidate to have no search writer or write-key fingerprint", () => {
    const source = inspectionProfile();
    source.observations.searchCredentials.writeKeySha256 = profileExample.observations.searchCredentials.writeKeySha256;
    expect(() => buildReleasePacket(JSON.stringify(source), pinned, at)).toThrow();
    source.observations.features.searchWrite = true;
    expect(() => buildReleasePacket(JSON.stringify(source), pinned, at)).toThrow();
  });
});

describe("protected release profile", () => {
  it("automatically produces a stable single-line packet for the exact profile bytes and deployments", () => {
    const ticket = buildReleasePacket(raw, release, at);
    expect(ticket).toEqual(buildReleasePacket(raw, release, at));
    expect(ticket.raw).not.toMatch(/[\r\n]/);
    expect(ticket.digest).toBe(digest(ticket.raw));
    expect(JSON.parse(ticket.raw).profileSha256).toBe(digest(raw));
    expect(buildReleasePacket(raw.trim(), release, at).digest).not.toBe(ticket.digest);
    const profile = verifyReleasePacket(ticket.raw, ticket.digest, release, at);
    expect(profile.observations).toEqual(profileExample.observations);
    expect(observationsFor(profile, release, "previous", at)).toEqual({expectations:profileExample.observations,legacyPrevious:false});
  });

  it("validates independent expiring evidence both at issue time and at final authorization", () => {
    const profile = makeProfile();
    profile.evidence.emailCallbacks.expiresAt = "2026-11-20T02:05:00.000Z";
    const ticket = buildReleasePacket(JSON.stringify(profile),release,at);
    expect(() => verifyReleasePacket(ticket.raw,ticket.digest,release,at + 300000)).toThrow();
    profile.evidence.emailCallbacks.observedAt = "2026-11-20T02:03:00.000Z";
    expect(() => readReleaseProfile(JSON.stringify(profile),at)).toThrow();
    Reflect.deleteProperty(profile.evidence,"emailCallbacks");
    expect(() => readReleaseProfile(JSON.stringify(profile),at)).toThrow();
  });

  it("refuses altered packets, malformed tuples and a digest for another release", () => {
    const ticket = buildReleasePacket(raw, release, at);
    expect(() => verifyReleasePacket(ticket.raw, digest("other"), release, at)).toThrow();
    const corrupted = JSON.parse(ticket.raw);
    corrupted.profileSha256 = digest("different profile");
    const spoofed = JSON.stringify(corrupted);
    expect(() => verifyReleasePacket(spoofed, digest(spoofed), release, at)).toThrow();
    expect(() => verifyReleasePacket(ticket.raw,ticket.digest,{...release, previousId:"dpl_other"},at)).toThrow();
    expect(() => buildReleasePacket(raw,{...release,candidateId:release.previousId},at)).toThrow();
    expect(() => buildReleasePacket(raw,{...release,previousSha:"unspecified"},at)).toThrow();
  });

  it("requires explicit, separate expected states when builds differ and checks the real old identity", () => {
    const profile = readReleaseProfile(raw,at);
    const previous = { ...profile.observations, features:{...profile.observations.features, searchWrite:false} };
    expect(observationsFor({...profile, previous}, release, "previous",at)).toEqual({expectations:previous,legacyPrevious:false});
    const historic = { ...release, previousId: profile.legacyPrevious.deploymentId, previousSha: profile.legacyPrevious.sha };
    expect(observationsFor(profile,historic,"previous",at)).toEqual({expectations:profile.legacyPrevious.observations,legacyPrevious:true});
    expect(() => buildReleasePacket(JSON.stringify({...profile,legacyPrevious:null}),historic,at)).toThrow();
    expect(() => observationsFor(profile,{...historic,previousSha:release.previousSha},"previous",at)).toThrow();
  });

  it("only accepts the bounded profile schema and rejects ambiguous duplicate fields", () => {
    expect(() => readReleaseProfile(JSON.stringify({...makeProfile(),token:"forbidden"}),at)).toThrow();
    expect(() => readReleaseProfile(raw.replace('"version": 1','"version": 2, "version": 1'),at)).toThrow();
    expect(() => readReleaseProfile("x".repeat(32*1024),at)).toThrow();
    const bad = makeProfile();
    bad.observations.features.productionEmailGateway = true;
    expect(() => readReleaseProfile(JSON.stringify(bad),at)).toThrow();
  });
});
