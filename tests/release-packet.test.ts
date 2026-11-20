import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { readReleasePacket } from "../scripts/release/packet.mjs";

it("binds provider evidence and expected capabilities to the approved pair and owner-observed validity window", () => {
  const digest = (s: string) => createHash("sha256").update(s).digest("hex");
  const pair = { candidateId: "dpl_new", candidateSha: "b".repeat(40), previousId: "dpl_old", previousSha: "a".repeat(40) };
  const raw = JSON.stringify({ ...pair, observedAt: "2026-11-20T01:00:00.000Z", expiresAt: "2026-11-20T03:00:00.000Z",
    evidence: Object.fromEntries(["authRouting","searchWriters","emailCallbacks","checkoutSettlement","rollbackCompatibility"].map(k => [k, digest(k)])),
    observations: { version: 1 } });
  const now = Date.parse("2026-11-20T02:00:00Z");
  expect(readReleasePacket(raw, digest(raw), pair, now)).toEqual({ version: 1 });
  expect(() => readReleasePacket(raw, digest(raw), { ...pair, previousId: "dpl_other" }, now)).toThrow();
  expect(() => readReleasePacket(raw, digest(raw), pair, now + 3600000)).toThrow();
  expect(() => readReleasePacket(raw, digest("other"), pair, now)).toThrow();
});
