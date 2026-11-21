import { createHash } from "node:crypto";
import { originalCatalogBuild, validateLegacyPublicObservations, validateObservations } from "./observations.mjs";

const providers = ["authRouting", "searchWriters", "emailCallbacks", "checkoutSettlement"];
const pairKeys = ["candidateId", "candidateSha", "previousId", "previousSha"];
const { deploymentId: legacyId, sha: legacySha } = originalCatalogBuild;
const unobservable = ["features.bulkSearchReindex", "features.searchWrite",
  "searchCredentials.webhookSecretSha256", "searchCredentials.writeKeySha256"];
const profileLimit = 16 * 1024;
const packetLimit = 2 * profileLimit + 1024;
const hash = value => createHash("sha256").update(value, "utf8").digest("hex");
const isHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function check(ok, reason) {
  if (!ok) throw new Error("Release expectations: " + reason);
}
function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}
function boundedJson(raw, limit) {
  check(typeof raw === "string" && raw.length <= limit && Buffer.byteLength(raw) <= limit, "invalid JSON size");
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("Release expectations: invalid JSON"); }
  // A duplicate field could conceal unapproved text from validation before its source bytes
  // enter the job output. Count object properties lexically, skipping complete string values.
  const properties = text => Array.from(text.matchAll(/"(?:\\.|[^"\\])*"\s*(:)?/g), token => Boolean(token[1])).filter(Boolean).length;
  check(properties(raw) === properties(JSON.stringify(value)), "ambiguous JSON fields");
  return value;
}
function attest(item, now, fresh) {
  check(exact(item, ["observedAt", "expiresAt", "sha256"]) && typeof item.observedAt === "string" &&
    typeof item.expiresAt === "string" && isHash(item.sha256), "invalid evidence reference");
  const from = Date.parse(item.observedAt), until = Date.parse(item.expiresAt);
  check(Number.isFinite(from) && Number.isFinite(until) && new Date(from).toISOString() === item.observedAt &&
    new Date(until).toISOString() === item.expiresAt && from < until && from <= now, "invalid evidence window");
  if (fresh) check(now < until, "provider evidence expired");
}
function releasePair(release) {
  check(release && pairKeys.every(k => typeof release[k] === "string") &&
    [release.candidateId, release.previousId].every(id => /^dpl_[A-Za-z0-9]{1,128}$/.test(id)) &&
    [release.candidateSha, release.previousSha].every(s => /^[a-f0-9]{40}$/.test(s)) &&
    release.candidateId !== release.previousId, "invalid release pair");
  return Object.fromEntries(pairKeys.map(k => [k, release[k]]));
}

function verifyInspectionEvidence(legacy, now) {
  check(exact(legacy, ["deploymentId", "sha", "observation", "publicObservations", "protectedValues"]) &&
    legacy.deploymentId === legacyId && legacy.sha === legacySha, "invalid legacy inspection artifact");
  validateLegacyPublicObservations(legacy.publicObservations);
  attest(legacy.observation, now, true);

  const statement = legacy.protectedValues;
  check(exact(statement, ["observedAt", "expiresAt", "evidenceSha256", "unobservable", "sha256"]) &&
    JSON.stringify(statement.unobservable) === JSON.stringify(unobservable) &&
    statement.evidenceSha256 !== legacy.observation.sha256, "invalid protected legacy statement");
  const { observedAt, expiresAt, evidenceSha256 } = statement;
  attest({ observedAt, expiresAt, sha256: evidenceSha256 }, now, true);
  const binding = [legacyId, legacySha, observedAt, expiresAt, evidenceSha256, unobservable];
  check(statement.sha256 === hash(JSON.stringify(binding)), "protected legacy statement digest mismatch");
}

export function readReleaseProfile(raw, now = Date.now()) {
  check(Number.isFinite(now), "invalid clock");
  const profile = boundedJson(raw, profileLimit);
  if (profile?.version === 2) {
    check(exact(profile, ["version", "mode", "observations", "legacyPrevious", "evidence"]) &&
      profile.mode === "inspection-only", "invalid inspection profile");
    verifyInspectionEvidence(profile.legacyPrevious, now);
  } else {
    check(exact(profile, ["version", "observations", "previous", "legacyPrevious", "evidence"]) &&
      profile.version === 1, "invalid profile");
    if (profile.previous !== "same") validateObservations(profile.previous);
    const legacy = profile.legacyPrevious;
    if (legacy !== null) {
      check(exact(legacy, ["deploymentId","sha","observation","observations"]) &&
        legacy.deploymentId === legacyId && legacy.sha === legacySha, "invalid legacy artifact");
      validateObservations(legacy.observations);
      attest(legacy.observation, now, false);
    }
  }
  validateObservations(profile.observations);
  check(profile.version !== 2 || !profile.observations.features.searchWrite,
    "inspection candidate must disable application Search writes");
  check(exact(profile.evidence, providers), "invalid provider reports");
  for (const provider of providers) attest(profile.evidence[provider], now, true);
  return profile;
}

export function observationsFor(profile, release, phase, now = Date.now()) {
  releasePair(release);
  check(["previous","staged","canonical"].includes(phase), "invalid observation phase");
  if (profile.version === 2) {
    check(profile.mode === "inspection-only" && phase !== "canonical" &&
      release.previousId === legacyId && release.previousSha === legacySha, "invalid original Catalog inspection");
    verifyInspectionEvidence(profile.legacyPrevious, now);
    if (phase === "previous") {
      return { expectations: profile.legacyPrevious.publicObservations, legacyPrevious: true, inspectionOnly: true };
    }
  }
  if (phase !== "previous") return { expectations: profile.observations, legacyPrevious: false };
  if (release.previousId === legacyId) {
    check(release.previousSha === legacySha && profile.legacyPrevious?.deploymentId === legacyId &&
      profile.legacyPrevious.sha === legacySha, "missing legacy evidence for the previous deployment");
    attest(profile.legacyPrevious.observation, now, true);
    return { expectations:profile.legacyPrevious.observations, legacyPrevious:true };
  }
  return { expectations:profile.previous === "same" ? profile.observations : profile.previous, legacyPrevious:false };
}

export function buildReleasePacket(rawProfile, release, now = Date.now()) {
  const profile = readReleaseProfile(rawProfile, now);
  const pair = releasePair(release);
  observationsFor(profile, pair, "previous", now);
  // Exact bytes of the protected source are retained. JSON escaping keeps the workflow output on one line.
  const raw = JSON.stringify({ version:1, ...pair, profileSha256:hash(rawProfile), profile:rawProfile });
  return { raw, digest:hash(raw) };
}

export function verifyReleasePacket(raw, expectedDigest, release, now = Date.now()) {
  const packet = boundedJson(raw, packetLimit);
  check(isHash(expectedDigest) && hash(raw) === expectedDigest, "packet digest mismatch");
  const pair = releasePair(release);
  check(exact(packet, ["version", ...pairKeys, "profileSha256", "profile"]) && packet.version === 1 &&
    pairKeys.every(k => packet[k] === pair[k]) && typeof packet.profile === "string" &&
    isHash(packet.profileSha256) && hash(packet.profile) === packet.profileSha256, "packet does not match its release or profile");
  const profile = readReleaseProfile(packet.profile, now);
  observationsFor(profile, pair, "previous", now);
  return profile;
}
