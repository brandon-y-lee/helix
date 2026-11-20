import { createHash } from "node:crypto";

const evidenceNames = ["authRouting", "searchWriters", "emailCallbacks", "checkoutSettlement", "rollbackCompatibility"];
const hash = /^[a-f0-9]{64}$/;

export function readReleasePacket(raw, expectedDigest, release, now = Date.now()) {
  if (typeof raw !== "string" || Buffer.byteLength(raw) > 16 * 1024 || !hash.test(expectedDigest) ||
      createHash("sha256").update(raw).digest("hex") !== expectedDigest) {
    throw new Error("Release expectations do not match the approved digest.");
  }
  const packet = JSON.parse(raw);
  if (!packet || typeof packet !== "object" || Array.isArray(packet) ||
      ["candidateId","candidateSha","previousId","previousSha"].some(k => packet[k] !== release[k])) {
    throw new Error("Release expectations belong to another deployment pair.");
  }
  const from = Date.parse(packet.observedAt), until = Date.parse(packet.expiresAt);
  if (!Number.isFinite(from) || !Number.isFinite(until) || from > now || now >= until ||
      new Date(from).toISOString() !== packet.observedAt || new Date(until).toISOString() !== packet.expiresAt ||
      !packet.evidence || Object.keys(packet.evidence).length !== evidenceNames.length ||
      !evidenceNames.every(key => typeof packet.evidence[key] === "string" && hash.test(packet.evidence[key]))) {
    throw new Error("Release expectations require fresh retained provider and rollback evidence.");
  }
  return packet.observations;
}
