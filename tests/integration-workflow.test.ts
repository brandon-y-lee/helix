import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const coordinator = readFileSync(
  resolve(projectRoot, ".github/workflows/dev-integration.yml"),
  "utf8",
);
const verification = readFileSync(
  resolve(projectRoot, ".github/workflows/dev-integration-verification.yml"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(projectRoot, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

describe("dev Integration Line workflows", () => {
  it("separates the trusted coordinator from read-only candidate verification", () => {
    expect(coordinator).toContain("pull_request_target:");
    expect(coordinator).toContain("workflow_run:");
    expect(coordinator).toContain("workflow_dispatch:");
    expect(coordinator).toContain("group: dev-integration");
    expect(coordinator).toContain("cancel-in-progress: false");
    expect(coordinator).toContain("timeout-minutes: 20");
    expect(coordinator).toContain("contents: write");
    expect(coordinator).toContain("pull-requests: write");
    expect(coordinator).toContain("issues: write");
    expect(coordinator).toContain("actions: write");
    expect(coordinator).toContain("ref: dev");
    expect(coordinator).toContain("persist-credentials: false");
    expect(coordinator).toContain("run: pnpm integration:dev");
    expect(coordinator).not.toContain("verify-production-ci.ts");
    expect(packageJson.scripts["integration:dev"]).toBe(
      "tsx scripts/github/run-integration-coordinator.ts",
    );

    expect(verification).toContain("workflow_dispatch:");
    expect(verification).toContain("candidate_head:");
    expect(verification).toContain("dev_base:");
    expect(verification).toContain("gate:");
    expect(verification).toContain("permissions:\n  contents: read");
    expect(verification).toContain("timeout-minutes: 20");
    expect(verification).toContain("persist-credentials: false");
    expect(verification).toContain("scripts/github/prepare-integration-candidate.ts");
    expect(verification).toContain("if: ${{ inputs.gate == 'complete-behavioral' }}");
    expect(verification).toContain("pnpm tsx scripts/verify-production-ci.ts build");
    expect(verification).toContain("pnpm tsx scripts/verify-production-ci.ts verify");
  });
});
