import { expect, it } from "vitest";
import { createReleaseSource } from "../scripts/release/github.mjs";

it("admits the exact merged internal release with its two required CI checks", async () => {
  const head = "a".repeat(40), main = "b".repeat(40), tree = "c".repeat(40);
  const repo = { full_name: "brandon-y-lee/helix", id: 42 };
  const state = {
    pr: { number: 11, merged_at: "2026-11-20", merged: true, state: "closed", draft: false, merge_commit_sha: main,
      head: { repo, ref: "dev", sha: head }, base: { repo, ref: "main" } },
    run: { id: 99, path: ".github/workflows/ci.yml", head_repository: { id: 42 }, event: "pull_request",
      head_branch: "dev", head_sha: head, pull_requests: [{ number: 11 }], conclusion: "success" },
    jobs: ["ci", "integration-gate"].map(name => ({ name, conclusion: "success", steps: [{ name: `Report Main Compatibility Gate for Release PR 11 source ${head}`, conclusion: "success" }] })),
  };
  const read: typeof fetch = async (input) => { const url = String(input); return Response.json(
    url.includes("/pulls/") ? state.pr : url.includes("/git/commits/") ? { tree: { sha: tree } } :
    url.includes("ci.yml") ? { workflow_runs: [state.run] } : { jobs: state.jobs },
  ); };
  const source = createReleaseSource("synthetic", read);
  await source.verifyPr("11", "merged", main, "42");
  // GitHub drops its pull_requests array after merge on the real release run.
  state.run.pull_requests = [];
  await source.verifyPr("11", "merged", main, "42");
  state.jobs[0].steps[0].name = "Another PR";
  await expect(source.verifyPr("11", "merged", main, "42")).rejects.toThrow(/bound/);
  state.run.pull_requests = [{ number: 11 }];
  state.jobs[1].conclusion = "skipped";
  await expect(source.verifyPr("11", "merged", main, "42")).rejects.toThrow(/gates/);
  state.pr.head.ref = "feature";
  await expect(source.verifyPr("11", "merged", main, "42")).rejects.toThrow(/internal/);
});
