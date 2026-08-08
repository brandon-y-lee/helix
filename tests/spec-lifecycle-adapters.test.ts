import { describe, expect, it } from "vitest";

import {
  createSpecLifecycleAdapters,
  type SpecCommandAdapter,
} from "@/scripts/github/spec-lifecycle-adapters";
import { runSpecLifecycle } from "@/scripts/github/spec-integration-lifecycle";

describe("spec lifecycle production adapters", () => {
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
              conditions: { ref_name: { include: ["refs/heads/codex/spec-*"] } },
              rules: [
                { type: "pull_request", parameters: { allowed_merge_methods: ["squash"] } },
                { type: "required_status_checks", parameters: { required_status_checks: [{ context: "ci" }, { context: "affected-browser-verification" }] } },
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
    expect(rulesetIndex).toBeGreaterThan(createIndex);
  });
});
