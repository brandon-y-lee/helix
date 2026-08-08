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
const ci = readFileSync(resolve(projectRoot, ".github/workflows/ci.yml"), "utf8");
const activeProductMedia = readFileSync(
  resolve(projectRoot, ".github/workflows/active-product-media-verification.yml"),
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
    expect(coordinator).toContain("timeout-minutes: 30");
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
    expect(verification).toContain("contents: read");
    expect(verification).toContain("timeout-minutes: 20");
    expect(verification).toContain("persist-credentials: false");
    expect(verification).toContain("scripts/github/prepare-integration-candidate.ts");
    expect(verification).toContain("if: ${{ inputs.gate == 'complete-behavioral' }}");
    expect(verification).toContain("scripts/verify-production-ci.ts build");
    expect(verification).toContain("scripts/verify-production-ci.ts verify");
  });

  it("keeps every non-coordinator workflow token explicitly read-only", () => {
    for (const workflow of [ci, activeProductMedia]) {
      expect(workflow).toContain("permissions:\n  contents: read");
      expect(workflow).not.toContain("contents: write");
      expect(workflow).not.toContain("actions: write");
      expect(workflow).not.toContain("issues: write");
      expect(workflow).not.toContain("pull-requests: write");
    }
  });

  it("uses proportional PR evidence and signs one stable Integration Slot result", () => {
    expect(ci).toContain("fetch-depth: 0");
    expect(ci).toContain("pnpm verify:affected -- --base \"origin/${{ github.base_ref }}\"");
    expect(ci).not.toContain("scripts/verify-production-ci.ts verify");

    expect(verification).toContain("id-token: write");
    expect(verification).toContain("attestations: write");
    expect(verification).toContain("artifact-metadata: write");
    expect(verification).toContain("attest-stable-result:");
    expect(verification).toContain("Install audited signer dependencies");
    expect(verification).toContain("--ignore-scripts");
    expect(verification).toContain("Materialize candidate as non-executable input");
    expect(verification).toContain("Isolate candidate execution from the audited runner");
    expect(verification).toContain("sudo -E -H -u verifier-candidate");
    expect(verification).toContain("chmod -R a-w trusted");
    expect(verification).toContain("Freeze the receipted artifact before browser verification");
    expect(verification).toContain("verification:catalog-fingerprint");
    expect(verification).toContain(
      "scripts/verify-production-ci.ts verify --selection routine-chromium",
    );
    expect(verification).toContain("uses: actions/attest@v4");
    expect(verification).toContain("predicate-type:");
    expect(verification).toContain("verification:receipt:verify");
    expect(verification).toContain("PLAYWRIGHT_JSON_OUTPUT_FILE:");
    expect(verification).toContain("playwright-telemetry.json");
    expect(verification).toContain('test -s "$PLAYWRIGHT_JSON_OUTPUT_FILE"');
    expect(verification).toContain("retention-days: 30");
    expect(verification).toContain("retention-days: 90");
    expect(ci).toContain("verification:receipt:protected-push");
    expect(ci).toContain('branches: [dev, main, "codex/spec-*"]');
    expect(ci).toContain("classify-windows-lifecycle:");
    expect(ci).toContain("needs: classify-windows-lifecycle");
    expect(ci).toContain("workflow_dispatch:");
    expect(ci).toContain("schedule:");
  });
});
