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
const windowsLifecycle = readFileSync(
  resolve(projectRoot, ".github/workflows/verification-lifecycle-windows.yml"),
  "utf8",
);
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
    expect(verification.match(/FROZEN_PULL_REQUEST: \$\{\{ inputs\.pr_number \}\}/g)).toHaveLength(2);
    expect(verification.match(/case "\$FROZEN_PULL_REQUEST" in/g)).toHaveLength(2);
    const frozenHeadFetch =
      'git -C trusted fetch --no-tags origin "refs/pull/$FROZEN_PULL_REQUEST/head"';
    expect(verification.split(frozenHeadFetch)).toHaveLength(3);
    const verifierJob = verification
      .split("  verify-frozen-candidate:")[1]!
      .split("  attest-stable-result:")[0]!;
    expect(verifierJob.indexOf("Fetch the frozen pull-request head")).toBeLessThan(
      verifierJob.indexOf("Prepare the exact candidate and base in an isolated worktree"),
    );
    const signerJob = verification.split("  attest-stable-result:")[1]!;
    expect(signerJob.indexOf("Fetch the frozen pull-request head")).toBeLessThan(
      signerJob.indexOf("Materialize candidate as non-executable input"),
    );
    expect(verification).toContain("scripts/github/prepare-integration-candidate.ts");
    expect(verification).toContain("if: ${{ inputs.gate == 'complete-behavioral' }}");
    expect(verification).toContain("scripts/verify-production-ci.ts build");
    expect(verification).toContain("scripts/verify-production-ci.ts verify");
  });

  it("keeps candidate execution read-only and narrowly grants bootstrap dispatch", () => {
    for (const workflow of [ci, activeProductMedia]) {
      expect(workflow).toContain("permissions:\n  contents: read");
      expect(workflow).not.toContain("contents: write");
      expect(workflow).not.toContain("issues: write");
      expect(workflow).not.toContain("pull-requests: write");
    }
    expect(activeProductMedia).not.toContain("actions: write");
    expect(ci).toContain("protected-push-receipt:\n    if:");
    expect(ci).toContain(
      "permissions:\n      actions: write\n      attestations: read\n      contents: read",
    );
    expect(ci.match(/actions: write/g)).toHaveLength(1);
  });

  it("uses a valid public site URL when the optional repository variable is unset", () => {
    const fallback =
      "NEXT_PUBLIC_SITE_URL: ${{ vars.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000' }}";
    expect(ci.match(/NEXT_PUBLIC_SITE_URL:/g)).toHaveLength(3);
    expect(verification.match(/NEXT_PUBLIC_SITE_URL:/g)).toHaveLength(2);
    expect(ci.split(fallback)).toHaveLength(4);
    expect(verification.split(fallback)).toHaveLength(3);
  });

  it("uses proportional PR evidence and signs one stable Integration Slot result", () => {
    expect(ci).toContain("fetch-depth: 0");
    expect(ci).toContain("pnpm verify:affected -- --base \"origin/${{ github.base_ref }}\"");
    expect(ci).toContain("Classify verification-system pull request");
    expect(ci).toContain("node scripts/github/verification-system-paths.mjs");
    expect(ci).toContain("steps.verification-system.outputs.relevant != 'true'");
    expect(ci).not.toContain("scripts/verify-production-ci.ts verify");

    expect(verification).toContain("id-token: write");
    expect(verification).toContain("attestations: write");
    expect(verification).toContain("artifact-metadata: write");
    expect(verification).toContain("attest-stable-result:");
    expect(verification).toContain("Install audited signer dependencies");
    expect(verification).toContain("--ignore-scripts");
    expect(verification).toContain("Materialize candidate as non-executable input");
    expect(verification).toContain("Isolate candidate execution from the audited runner");
    expect(verification).toContain('case "$PNPM_HOME" in');
    expect(verification).toContain('case "$pnpm_executable" in');
    expect(verification).toContain(
      'sudo cp -a -- "$pnpm_runtime_root/." /opt/mei-pelle-pnpm-runtime/',
    );
    expect(verification).toContain(
      'sudo chmod -R a-w -- /opt/mei-pelle-pnpm-runtime',
    );
    expect(verification).toContain(
      'echo "/opt/mei-pelle-pnpm-runtime/.bin" >> "$GITHUB_PATH"',
    );
    expect(verification).toContain(
      "sudo -u verifier-candidate test -x /opt/mei-pelle-pnpm-runtime/.bin/pnpm",
    );
    expect(verification).not.toContain('sudo chmod -R a+rX "$(dirname "$PNPM_HOME")"');
    expect(verification.indexOf("Isolate candidate execution from the audited runner")).toBeLessThan(
      verification.indexOf("Install frozen candidate dependencies"),
    );
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
    expect(verification).toContain("verification-receipt-command.ts evidence");
    expect(verification).toContain("VERIFICATION_EVIDENCE_PATH:");
    const signerJobEnvironment = verification
      .split("  attest-stable-result:")[1]!
      .split("    steps:")[0]!;
    expect(signerJobEnvironment).not.toContain("runner.temp");
    expect(verification).toContain(
      "Prepare canonical Verification Receipt with audited code\n        id: receipt\n        env:\n          VERIFICATION_EVIDENCE_PATH: ${{ runner.temp }}/verification-evidence/execution.json",
    );
    expect(verification).toContain("VERIFICATION_BROWSER_VERSION:");
    expect(verification).toContain("PLAYWRIGHT_JSON_OUTPUT_FILE:");
    expect(verification).toContain("playwright-telemetry.json");
    expect(verification).toContain('test -s "$PLAYWRIGHT_JSON_OUTPUT_FILE"');
    expect(verification).toContain("retention-days: 30");
    expect(verification).toContain("retention-days: 90");
    expect(ci).toContain("verification:receipt:protected-push");
    expect(ci).toContain("pnpm exec playwright install chromium");
    expect(ci).not.toContain("Build current protected-push artifact");
    expect(ci).toContain("needs: [ci-core, protected-push-receipt]");
    expect(ci).toContain('RECEIPT_RESULT: ${{ needs.protected-push-receipt.result }}');
    expect(ci).toContain('branches: [dev, main, "codex/spec-*"]');
    expect(ci).not.toContain("classify-windows-lifecycle:");
    expect(ci).not.toContain("workflow_dispatch:");
    expect(ci).not.toContain("schedule:");
    expect(windowsLifecycle).toContain("classify-windows-lifecycle:");
    expect(windowsLifecycle).toContain("needs: classify-windows-lifecycle");
    expect(windowsLifecycle).toContain("node scripts/github/verification-system-paths.mjs");
    expect(windowsLifecycle).toContain(
      'relevant="$(node scripts/github/verification-system-paths.mjs',
    );
    expect(windowsLifecycle).toContain(
      'if [[ "$relevant" != "true" && "$relevant" != "false" ]]',
    );
    expect(windowsLifecycle).not.toContain(
      "if node scripts/github/verification-system-paths.mjs",
    );
    expect(windowsLifecycle).toContain("verification-lifecycle-gate:");
    expect(windowsLifecycle).toContain(
      "needs: [classify-windows-lifecycle, verification-lifecycle-windows]",
    );
    expect(windowsLifecycle).toContain("WINDOWS_RESULT:");
    expect(windowsLifecycle).toContain("workflow_dispatch:");
    expect(windowsLifecycle).toContain("schedule:");
  });
});
