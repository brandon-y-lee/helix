import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import profileExample from "../scripts/release/catalog-profile.example.json";
import { buildReleasePacket, observationsFor, readReleaseProfile, verifyReleasePacket } from "../scripts/release/packet.mjs";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const release = { candidateId: "dpl_new", candidateSha: "b".repeat(40), previousId: "dpl_old", previousSha: "a".repeat(40) };
const at = Date.parse("2026-11-20T02:00:00Z");
const makeProfile = () => structuredClone(profileExample);
const raw = JSON.stringify(profileExample, null, 2) + "\n";

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
