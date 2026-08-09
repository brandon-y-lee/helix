import { describe, expect, it } from "vitest";

import {
  assertTrustedActionsContext,
  createSpecLifecycleAdapters,
  type SpecCommandAdapter,
} from "@/scripts/github/spec-lifecycle-adapters";
import { runSpecLifecycle } from "@/scripts/github/spec-integration-lifecycle";
import { desiredSpecRuleset } from "@/scripts/github/spec-ruleset.mjs";

describe("spec lifecycle production adapters", () => {
  it("binds mutation authority to OIDC claims and an observable dispatched Actions run", async () => {
    const audience = "https://github.com/brandon-y-lee/mei-pelle/spec-lifecycle";
    const environment = {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "brandon-y-lee/mei-pelle",
      GITHUB_RUN_ID: "12345",
      GH_TOKEN: "redacted",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.githubusercontent.com/example/token",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "actions-bearer",
    };
    let workflowRef = "brandon-y-lee/mei-pelle/.github/workflows/spec-lifecycle.yml@refs/heads/dev";
    const requestIdentityToken = async () => {
      const claims = {
        aud: audience,
        repository: "brandon-y-lee/mei-pelle",
        event_name: "workflow_dispatch",
        ref: "refs/heads/dev",
        workflow_ref: workflowRef,
      };
      return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
    };
    const commands: SpecCommandAdapter = {
      async run() {
        return {
          status: 0,
          stderr: "",
          stdout: JSON.stringify({
            name: "Spec Lifecycle Orchestrator",
            event: "workflow_dispatch",
            head_branch: "dev",
            repository: { full_name: "brandon-y-lee/mei-pelle" },
          }),
        };
      },
    };
    await expect(
      assertTrustedActionsContext("brandon-y-lee/mei-pelle", commands, environment, requestIdentityToken),
    ).resolves.toBeUndefined();
    workflowRef = "brandon-y-lee/mei-pelle/.github/workflows/rogue.yml@refs/heads/dev";
    await expect(
      assertTrustedActionsContext("brandon-y-lee/mei-pelle", commands, environment, requestIdentityToken),
    ).rejects.toThrow("not bound to the audited Spec Lifecycle Orchestrator");
  });

  it("rejects ticket history whose merge parent is outside the current spec branch", async () => {
    let rejectSibling = false;
    const commands: SpecCommandAdapter = {
      async run(_command, args) {
        const joined = args.join(" ");
        if (joined.includes("rev-parse refs/remotes/origin/codex/61-foundation")) return { status: 0, stderr: "", stdout: "child-head\n" };
        if (joined.includes("rev-parse refs/remotes/origin/codex/spec-60-catalog-refresh")) return { status: 0, stderr: "", stdout: "spec-head\n" };
        if (joined.includes("rev-list --parents")) return { status: 0, stderr: "", stdout: "child-head base-sha sibling-parent\n" };
        if (joined.includes("merge-base --is-ancestor sibling-parent spec-head")) {
          return { status: rejectSibling ? 1 : 0, stderr: rejectSibling ? "not an ancestor" : "", stdout: "" };
        }
        return { status: 0, stderr: "", stdout: "" };
      },
    };
    const adapters = createSpecLifecycleAdapters("brandon-y-lee/mei-pelle", commands);
    const input = {
      pullRequestNumber: 101,
      branch: "codex/61-foundation",
      baseBranch: "codex/spec-60-catalog-refresh",
      baseSha: "base-sha",
      headSha: "child-head",
    };

    await expect(adapters.git.verifyFlatTicketBranch(input)).resolves.toBe(true);
    rejectSibling = true;
    await expect(adapters.git.verifyFlatTicketBranch(input)).resolves.toBe(false);
  });

  it("creates a spec branch and proves the active audited wildcard ruleset", async () => {
    const desiredRuleset = desiredSpecRuleset(15368);
    const requiredChecks = desiredRuleset.rules
      .find((rule) => rule.type === "required_status_checks")
      ?.parameters?.required_status_checks;
    expect(desiredRuleset.bypass_actors).toEqual([]);
    expect(desiredRuleset.rules.some((rule) => rule.type === "update")).toBe(false);
    expect(requiredChecks).toEqual([
      { context: "ci", integration_id: 15368 },
      { context: "affected-browser-verification", integration_id: 15368 },
      { context: "verification-system-browser-gate", integration_id: 15368 },
      { context: "verification-lifecycle-gate", integration_id: 15368 },
    ]);
    const calls: Array<{ command: string; args: string[]; input?: string }> = [];
    const commands: SpecCommandAdapter = {
      async run(command, args, options = {}) {
        calls.push({ command, args, input: options.input });
        const joined = args.join(" ");
        if (joined.includes("issue view 60")) {
          return {
            status: 0,
            stderr: "",
            stdout: JSON.stringify({
              number: 60,
              state: "OPEN",
              labels: [{ name: "type:spec" }, { name: "workflow:planned" }],
              assignees: [],
              body: "",
            }),
          };
        }
        if (joined.includes("dependencies/blocked_by")) return { status: 0, stderr: "", stdout: "[]" };
        if (joined.includes("git/ref/heads/codex%2Fspec-60-catalog-refresh")) {
          return { status: 1, stderr: "HTTP 404: Not Found", stdout: "" };
        }
        if (joined.includes("git/ref/heads/dev")) {
          return { status: 0, stderr: "", stdout: JSON.stringify({ object: { sha: "dev-1" } }) };
        }
        if (joined.includes("rulesets?includes_parents=false")) {
          return { status: 0, stderr: "", stdout: JSON.stringify([{ id: 7, name: "spec branch pull request integration" }]) };
        }
        if (joined.includes("rulesets/7")) {
          return {
            status: 0,
            stderr: "",
            stdout: JSON.stringify(desiredSpecRuleset(15368)),
          };
        }
        return { status: 0, stderr: "", stdout: "{}" };
      },
    };

    const report = await runSpecLifecycle(
      { kind: "create-spec", specNumber: 60, specSlug: "catalog-refresh" },
      createSpecLifecycleAdapters("brandon-y-lee/mei-pelle", commands),
    );

    expect(report).toMatchObject({ outcome: "spec-created", branch: "codex/spec-60-catalog-refresh", devSha: "dev-1" });
    const createIndex = calls.findIndex((call) => call.args.includes("POST") && call.args.includes("repos/brandon-y-lee/mei-pelle/git/refs"));
    const rulesetIndex = calls.findIndex((call) => call.args.includes("repos/brandon-y-lee/mei-pelle/rulesets/7"));
    expect(createIndex).toBeGreaterThan(-1);
    expect(rulesetIndex).toBeGreaterThan(-1);
    expect(rulesetIndex).toBeLessThan(createIndex);
    expect(calls.filter((call) => call.args.includes("repos/brandon-y-lee/mei-pelle/rulesets/7"))).toHaveLength(2);
  });
});
