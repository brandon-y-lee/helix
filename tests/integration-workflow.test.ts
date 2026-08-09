import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const coordinator = readFileSync(
  resolve(projectRoot, ".github/workflows/dev-integration.yml"),
  "utf8",
);
const coordinatorCommand = readFileSync(
  resolve(projectRoot, "scripts/github/run-integration-coordinator.ts"),
  "utf8",
);
const verification = readFileSync(
  resolve(projectRoot, ".github/workflows/dev-integration-verification.yml"),
  "utf8",
);
const receiptCommand = readFileSync(
  resolve(projectRoot, "scripts/github/verification-receipt-command.ts"),
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
  it("retains structured Integration Line efficiency records for the 30-day audit", () => {
    expect(coordinator).toContain(
      'pnpm --silent integration:dev | tee "$RUNNER_TEMP/integration-efficiency.json"',
    );
    expect(coordinator).toContain("name: integration-efficiency-${{ github.run_id }}-${{ github.run_attempt }}");
    expect(coordinator).toContain("path: ${{ runner.temp }}/integration-efficiency.json");
    expect(coordinator).toContain("retention-days: 30");
    expect(coordinator).toContain("if-no-files-found: error");
    expect(verification).toContain("name: integration-verification-efficiency-${{ github.run_id }}");
    expect(verification).toContain("verification-browser-result.json");
    expect(verification).toContain("Create trusted compact verification efficiency result");
    expect(verification).toContain("scripts/github/integration-efficiency-command.ts");
    expect(verification).toContain("${{ runner.temp }}/integration-efficiency/verification-browser-result.json");
    expect(coordinatorCommand.indexOf("process.stdout.write")).toBeLessThan(
      coordinatorCommand.indexOf("await requestIntegrationHandoff(repository)"),
    );
  });

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
    expect(coordinator).toContain("run: pnpm --silent integration:dev");
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
      "sudo chown -R root:root -- /opt/mei-pelle-pnpm-runtime",
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
    expect(verification).toContain(
      "test \"$(stat -Lc '%u:%g' /opt/mei-pelle-pnpm-runtime/.bin/pnpm)\" = 0:0",
    );
    expect(verification).toContain(
      "sudo -u verifier-candidate test ! -w /opt/mei-pelle-pnpm-runtime/.bin/pnpm",
    );
    expect(verification).toContain('case "$GITHUB_WORKSPACE" in');
    expect(verification).toContain('case "$VERIFICATION_CANDIDATE_CWD" in');
    expect(verification).toContain("sudo chmod o+x -- /home/runner");
    expect(verification).toContain(
      'sudo -u verifier-candidate test -x "$GITHUB_WORKSPACE"',
    );
    expect(verification).toContain(
      'sudo -u verifier-candidate test -d "$VERIFICATION_CANDIDATE_CWD"',
    );
    expect(verification).toContain('case "$node_executable" in');
    expect(verification).toContain(
      "/*/hostedtoolcache/node/*/x64/bin/node) ;;",
    );
    expect(verification).toContain(
      'sudo install -o root -g root -m 0555 -- "$node_executable" /opt/mei-pelle-node-runtime/bin/node',
    );
    expect(verification).toContain(
      "test \"$(stat -Lc '%u:%g' /opt/mei-pelle-node-runtime/bin/node)\" = 0:0",
    );
    expect(verification).toContain(
      "sudo -u verifier-candidate test ! -w /opt/mei-pelle-node-runtime/bin/node",
    );
    expect(verification).toContain(
      'candidate_path="/opt/mei-pelle-node-runtime/bin:/opt/mei-pelle-pnpm-runtime/.bin:/usr/local/bin:/usr/bin:/bin"',
    );
    expect(verification).toContain(
      'echo "VERIFICATION_CANDIDATE_PATH=$candidate_path" >> "$GITHUB_ENV"',
    );
    expect(verification).toContain(
      'test "$(sudo -H -u verifier-candidate env "PATH=$candidate_path" node --version)" = "$(node --version)"',
    );
    expect(verification).toContain(
      'env "PATH=$VERIFICATION_CANDIDATE_PATH" pnpm --dir "$VERIFICATION_CANDIDATE_CWD" install --frozen-lockfile',
    );
    expect(verification).not.toContain(
      'verifier-candidate "$(command -v pnpm)"',
    );
    expect(verification).toContain(
      'sudo -E env "PATH=$VERIFICATION_CANDIDATE_PATH" pnpm --dir trusted exec playwright install-deps chromium',
    );
    expect(verification).not.toContain(
      "sudo -E pnpm --dir trusted exec playwright install-deps chromium",
    );
    expect(verification).not.toContain('sudo chmod -R a+rX "$(dirname "$PNPM_HOME")"');
    expect(verification.indexOf("Isolate candidate execution from the audited runner")).toBeLessThan(
      verification.indexOf("Install frozen candidate dependencies"),
    );
    expect(verification).toContain("sudo -E -H -u verifier-candidate");
    expect(verification).toContain("chmod -R a-w trusted");
    expect(verification).toContain("Freeze the receipted artifact before browser verification");
    expect(verification).toContain("sudo chmod -R a+rX candidate/.next");
    expect(verification.indexOf("sudo chmod -R a+rX candidate/.next")).toBeLessThan(
      verification.indexOf("sudo chmod -R a-w candidate/.next"),
    );
    expect(verification).toContain(
      "sudo -u verifier-candidate test -r candidate/.next/mei-pelle-artifact-receipt.json",
    );
    expect(verification).toContain("verification:catalog-fingerprint");
    expect(verification).toContain(
      "scripts/verify-production-ci.ts verify --selection routine-chromium",
    );
    expect(receiptCommand).not.toContain('from "@playwright/test"');
    expect(receiptCommand).toContain('candidateRequire("@playwright/test")');
    expect(receiptCommand).not.toContain(
      'pathToFileURL(candidateRequire.resolve("@playwright/test"))',
    );
    expect(verification).toContain(
      'browser_version="$(sudo -E -H -u verifier-candidate env -u GITHUB_OUTPUT',
    );
    expect(verification).toContain(
      'if [[ ! "$browser_version" =~ ^Chromium\\ [0-9]+(\\.[0-9]+){3}$ ]]; then',
    );
    expect(verification).toContain(
      'printf \'version=%s\\n\' "$browser_version" >> "$GITHUB_OUTPUT"',
    );
    expect(verification).not.toContain(
      'pnpm --dir trusted exec tsx scripts/github/verification-receipt-command.ts browser-version\n',
    );
    expect(verification).toContain("Freeze browser evidence for retention");
    expect(verification).toContain(
      "if: ${{ always() && inputs.gate == 'complete-behavioral' }}",
    );
    expect(verification).toContain("sudo pkill -KILL -u verifier-candidate");
    expect(verification).toContain("sudo chown root:root -- candidate");
    expect(verification).toContain("sudo chmod a-w -- candidate");
    expect(verification).toContain(
      "for evidence_path in candidate/playwright-report candidate/test-results; do",
    );
    expect(verification).toContain(
      'symlink_path="$(sudo find "$evidence_path" -type l -print -quit)" || {',
    );
    expect(verification).toContain(
      'echo "Browser evidence traversal failed closed for $evidence_path." >&2',
    );
    expect(verification).toContain('if [[ -n "$symlink_path" ]]; then');
    expect(verification).toContain(
      'echo "Browser evidence cannot contain symbolic links: $symlink_path" >&2',
    );
    expect(verification).not.toContain('test -z "$(find "$evidence_path"');
    expect(verification).toContain(
      'sudo cp -a -- "$evidence_path" "$RUNNER_TEMP/verification-browser-evidence/"',
    );
    expect(verification).toContain(
      "sudo chown -R root:root -- \"$RUNNER_TEMP/verification-browser-evidence\"",
    );
    expect(verification).toContain(
      "sudo chmod -R a-w -- \"$RUNNER_TEMP/verification-browser-evidence\"",
    );
    expect(verification).toContain(
      "${{ runner.temp }}/verification-browser-evidence/test-results/verification-browser-result.json",
    );
    expect(verification).toContain(
      "${{ runner.temp }}/verification-browser-evidence/playwright-report/",
    );
    expect(verification).not.toContain("path: |\n            candidate/playwright-report/");
    const freezeEvidence = verification.indexOf("Freeze browser evidence for retention");
    expect(freezeEvidence).toBeGreaterThan(
      verification.indexOf("Verify receipted production artifact with the trusted runner"),
    );
    expect(freezeEvidence).toBeLessThan(
      verification.indexOf("Record exact Chromium version"),
    );
    expect(freezeEvidence).toBeLessThan(
      verification.indexOf("Upload successful browser report and telemetry"),
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
