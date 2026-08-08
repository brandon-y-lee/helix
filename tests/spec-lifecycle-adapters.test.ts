import { describe, expect, it } from "vitest";

import {
  createSpecLifecycleAdapters,
  type SpecCommandAdapter,
} from "@/scripts/github/spec-lifecycle-adapters";
import { runSpecLifecycle } from "@/scripts/github/spec-integration-lifecycle";

describe("spec lifecycle production adapters", () => {
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
            stdout: JSON.stringify({
              enforcement: "active",
              bypass_actors: [{ actor_id: 15368, actor_type: "Integration", bypass_mode: "always" }],
              conditions: { ref_name: { include: ["refs/heads/codex/spec-*"] } },
              rules: [
                { type: "update", parameters: { update_allows_fetch_and_merge: false } },
                { type: "deletion" },
                { type: "non_fast_forward" },
                { type: "pull_request", parameters: { allowed_merge_methods: ["squash"], dismiss_stale_reviews_on_push: true, required_review_thread_resolution: true } },
                { type: "required_status_checks", parameters: { required_status_checks: [{ context: "ci", integration_id: 15368 }, { context: "affected-browser-verification", integration_id: 15368 }], strict_required_status_checks_policy: false, do_not_enforce_on_create: false } },
              ],
            }),
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
