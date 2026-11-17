// @vitest-environment node
import { describe, expect, it } from "vitest";
import { evaluateSupportReadiness, readinessClaims } from "@/scripts/support-production/readiness";

const candidate = "a".repeat(40);
const now = Date.parse("2026-11-17T08:00:00Z");
function packet() {
  return {
    version: 1, candidateCommit: candidate, observedAt: new Date(now).toISOString(),
    configuration: {
      context: "production", origin: "https://www.helixskin.us",
      projectRef: "abcdefghijklmnopqrst", projectUrl: "https://abcdefghijklmnopqrst.supabase.co",
      contractId: "00000000-0000-4000-8000-000000000001",
      storedProjectRef: "abcdefghijklmnopqrst", storedContractId: "00000000-0000-4000-8000-000000000001",
      photoBucket: "support-production-private", storedPhotoBucket: "support-production-private", photoWorkerLimit: 1,
      acknowledgementPolicy: "none_native_manual",
      credentialsPresent: { database: true, abuse: true, worker: true, sending: true, sentWebhook: true },
      runtimeControls: { admission: false, worker: false, fullMedia: false, isolation: false, operations: false },
      storedControls: { admission: false, worker: false, fullMedia: false, isolation: false, operations: false },
    },
    claims: Object.fromEntries(readinessClaims.map((name) => [name, true])),
  };
}
describe("production support read-only readiness", () => {
  it("never upgrades a complete assertion packet into actual verification or activation authority", () => {
    const report = evaluateSupportReadiness(packet(), candidate, now);
    expect(report.status).toBe("operator_review_required");
    expect(report.configurationComplete).toBe(true);
    expect(report.claimsComplete).toBe(true);
    expect(report.actualProductionVerified).toBe(false);
    expect(report.activationAuthorized).toBe(false);
  });

  it.each(["persistedSubmission", "providerHandoff", "inboxReceipt", "operatorReply", "maximumOriginalProcessing",
    "maximumCleanedDelivery", "operatorAttachmentHashes", "threadGrouping", "lateMediaAfterReply", "privateArchiveRestore",
    "developmentAccessRetired", "providerIsolation", "legacyReconciliation", "decoderDeployment", "quotaBudget", "reconciliationMonitoring",
    "primaryMonitor", "backupMonitor", "preservationCustodian"])("independently requires %s rather than inferring it from persistence", (claim) => {
    const value = packet(); value.claims[claim] = false;
    const report = evaluateSupportReadiness(value, candidate, now);
    expect(report.status).toBe("blocked");
    expect(report.missingClaims).toContain(claim);
    expect(report.actualProductionVerified).toBe(false);
  });

  it.each(["helix-support-photos", "helix-catalog", "different-private-bucket"])("rejects legacy or mismatched storage binding %s", (bucket) => {
    const value = packet(); value.configuration.photoBucket = bucket;
    expect(evaluateSupportReadiness(value, candidate, now).configurationComplete).toBe(false);
  });

  it("rejects zero fleet capacity, wrong target, open controls and stale/different candidates", () => {
    const zero = packet(); zero.configuration.photoWorkerLimit = 0;
    expect(evaluateSupportReadiness(zero, candidate, now).configurationComplete).toBe(false);
    const wrong = packet(); wrong.configuration.storedProjectRef = "qrstabcdefghijklmnop";
    expect(evaluateSupportReadiness(wrong, candidate, now).configurationComplete).toBe(false);
    const open = packet(); open.configuration.runtimeControls.admission = true;
    expect(evaluateSupportReadiness(open, candidate, now).configurationComplete).toBe(false);
    expect(evaluateSupportReadiness(packet(), "b".repeat(40), now).status).toBe("blocked");
    expect(evaluateSupportReadiness(packet(), candidate, now + 16 * 60_000).status).toBe("blocked");
  });

  it("refuses malformed, extra or secret-bearing input without echoing it", () => {
    const secret = "never-echo-secret-or-private-content";
    const value = { ...packet(), credentials: secret };
    const report = evaluateSupportReadiness(value, candidate, now);
    expect(report.status).toBe("blocked");
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(evaluateSupportReadiness(null, candidate, now).status).toBe("blocked");
    const missing = packet(); delete missing.claims.operatorReply;
    expect(evaluateSupportReadiness(missing, candidate, now).status).toBe("blocked");
  });
});

it("readiness command performs only its injected packet read and never returns a passing live gate", async () => {
  const { runSupportReadinessCommand } = await import("@/scripts/support-production/readiness-command");
  const calls: string[] = [];
  const result = runSupportReadinessCommand(["--candidate", candidate, "--packet", "private-packet.json"], (path) => {
    calls.push(path); return packet();
  }, now);
  expect(calls).toEqual(["private-packet.json"]);
  expect(result.exitCode).toBe(2);
  expect(result.report.activationAuthorized).toBe(false);
  expect(() => runSupportReadinessCommand(["apply"], () => packet(), now)).toThrow("Invalid readiness arguments");
});

it.each(["admission", "worker", "fullMedia", "isolation", "operations"] as const)("checks runtime and stored %s controls independently", (key) => {
  const runtime = packet(); runtime.configuration.runtimeControls[key] = true;
  const stored = packet(); stored.configuration.storedControls[key] = true;
  expect(evaluateSupportReadiness(runtime, candidate, now).checks.controlsDisabled).toBe(false);
  expect(evaluateSupportReadiness(stored, candidate, now).checks.controlsDisabled).toBe(false);
});

it("the real CLI reads only bounded private packets and never exits as an activation pass", async () => {
  const { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const root = mkdtempSync(join(tmpdir(), "helix-readiness-owned-"));
  const fresh = packet(); fresh.observedAt = new Date().toISOString();
  const run = (path: string) => spawnSync(process.execPath,
    ["--import", "tsx", "scripts/support-production-readiness.ts", "--candidate", candidate, "--packet", path],
    { cwd: process.cwd(), encoding: "utf8", timeout: 15_000, env: { PATH: process.env.PATH, NODE_ENV: "test" } });
  try {
    const privatePath = join(root, "private.json");
    writeFileSync(privatePath, JSON.stringify(fresh), { mode: 0o600 });
    const good = run(privatePath);
    expect(good.status).toBe(2);
    expect(JSON.parse(good.stdout).actualProductionVerified).toBe(false);
    expect(JSON.parse(good.stdout).activationAuthorized).toBe(false);
    expect(good.stdout).not.toContain(fresh.configuration.projectRef);
    const publicPath = join(root, "public.json");
    writeFileSync(publicPath, JSON.stringify(fresh), { mode: 0o644 }); chmodSync(publicPath, 0o644);
    const link = join(root, "link.json"); symlinkSync(privatePath, link);
    const oversized = join(root, "large.json");
    writeFileSync(oversized, JSON.stringify(fresh).padEnd(65 * 1024, " "), { mode: 0o600 });
    for (const path of [publicPath, link, oversized]) {
      const result = run(path);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("No services were contacted or changed");
      expect(result.stderr).not.toContain(root);
      expect(result.stderr).not.toContain(fresh.configuration.projectRef);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 20_000);
