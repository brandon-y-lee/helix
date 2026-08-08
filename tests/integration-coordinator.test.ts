import { describe, expect, it } from "vitest";

import { toIntegrationCandidate } from "@/scripts/github/run-integration-coordinator";

describe("GitHub Integration Coordinator adapter", () => {
  it("fails closed to verification-system work from current pull-request facts", () => {
    const candidate = toIntegrationCandidate({
      number: 52,
      baseRefName: "dev",
      headRefOid: "a".repeat(40),
      isDraft: false,
      mergeable: "MERGEABLE",
      updatedAt: "2026-08-08T08:00:00.000Z",
      body: "## Workflow path\n\n- Path: normal ticket\n",
      labels: [{ name: "workflow:integration-queued" }],
      files: [{ path: ".github/workflows/dev-integration.yml" }],
      statusCheckRollup: [
        { name: "ci", status: "COMPLETED", conclusion: "SUCCESS" },
      ],
    });

    expect(candidate).toEqual({
      number: 52,
      target: "dev",
      headSha: "a".repeat(40),
      readyAt: "2026-08-08T08:00:00.000Z",
      workClass: "verification-system",
      changedFiles: [".github/workflows/dev-integration.yml"],
      riskAreas: ["provider", "cross-cutting"],
      labels: ["workflow:integration-queued"],
      ready: true,
    });
  });
});
