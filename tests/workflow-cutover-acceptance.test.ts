import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  WORKFLOW_CUTOVER_CONTRACTS,
  evaluateWorkflowCutover,
} from "@/scripts/github/verification-orchestrator";

describe("complete verification workflow cutover", () => {
  it("defines the 30-day evaluation without authorizing more workers or shards", () => {
    const audit = readFileSync(
      resolve(process.cwd(), "docs/agents/efficiency-audit.md"),
      "utf8",
    );
    for (const metric of [
      "implementation-to-integration",
      "preflight",
      "queue wait",
      "test duration",
      "retries",
      "browser-case executions",
      "selected capabilities",
      "build reuse",
      "complete-plan runs",
      "failure classification",
    ]) {
      expect(audit.toLowerCase()).toContain(metric);
    }
    expect(audit).toContain("30 calendar days");
    expect(audit).toContain("No sharding or additional workers");
  });

  it("accepts the architecture only when every public contract and remote control is proven", () => {
    const evidence = Object.fromEntries(
      WORKFLOW_CUTOVER_CONTRACTS.map((contract) => [contract, "passed"]),
    );

    expect(evaluateWorkflowCutover(evidence)).toEqual({
      acceptance: "clean",
      adrs: "accepted",
      gaps: [],
      remoteCutover: "active",
    });
  });

  it("keeps the ADRs proposed and names every unproven or failed contract", () => {
    const evidence = Object.fromEntries(
      WORKFLOW_CUTOVER_CONTRACTS.map((contract) => [contract, "passed"]),
    );
    evidence["repository-cutover"] = "pending";
    evidence["deployment-controls"] = "failed";

    expect(evaluateWorkflowCutover(evidence)).toEqual({
      acceptance: "blocked",
      adrs: "proposed",
      gaps: [
        "repository-cutover is pending",
        "deployment-controls failed",
      ],
      remoteCutover: "pending",
    });
  });

  it("covers every approved high-impact acceptance seam", () => {
    expect(WORKFLOW_CUTOVER_CONTRACTS).toEqual([
      "work-classification",
      "affected-browser-verification",
      "local-build-reuse",
      "integration-slot-concurrency",
      "non-preemptive-urgent-priority",
      "timeout-and-failure-handoff",
      "verification-receipts",
      "spec-dependencies",
      "scheduled-failure-and-recovery",
      "staged-production-verification",
      "exact-production-promotion",
      "rollback-first-recovery",
      "efficiency-telemetry",
      "repository-cutover",
      "deployment-controls",
    ]);
  });
});
