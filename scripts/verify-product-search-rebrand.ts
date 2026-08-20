import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  findProductSearchCompletionEvidence,
  mayUseProductSearchCompletionEvidence,
  type GitHubIssueComment,
} from "./catalog/product-search-rebrand-evidence";
import { runProductSearchCli } from "./product-search";

const execFileAsync = promisify(execFile);

async function readCompletionComments(): Promise<GitHubIssueComment[]> {
  const { stdout } = await execFileAsync(
    "gh",
    [
      "issue",
      "view",
      "189",
      "--repo",
      "brandon-y-lee/helix",
      "--json",
      "comments",
    ],
    { encoding: "utf8", maxBuffer: 2_000_000 },
  );
  const value = JSON.parse(stdout) as { comments?: GitHubIssueComment[] };
  return Array.isArray(value.comments) ? value.comments : [];
}

async function main(): Promise<void> {
  const report = await runProductSearchCli(["verify"], process.env);
  if (report.ok) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (!mayUseProductSearchCompletionEvidence(report)) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const evidence = findProductSearchCompletionEvidence(
    await readCompletionComments(),
  );
  const composed = {
    ...report,
    ok: evidence !== null,
    verified: evidence !== null,
    blockers: evidence === null ? report.blockers : [],
    resolvedByCompletionEvidence:
      evidence === null ? [] : report.blockers,
    completionEvidence: evidence,
  };
  console.log(JSON.stringify(composed, null, 2));
  if (!composed.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
