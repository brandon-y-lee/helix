import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

const mirror = "codex/558-verified-dev-preview";
const candidate = "a".repeat(40);
const previous = "b".repeat(40);
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function run(devHead: string, mirrorHead: string, rejectUpdate = false) {
  const workflow = readFileSync(".github/workflows/dev-preview.yml", "utf8");
  const script = workflow.split("        run: |\n")[1];
  const directory = mkdtempSync(join(tmpdir(), "helix-preview-test-"));
  directories.push(directory);
  const calls = join(directory, "calls");
  writeFileSync(calls, "");
  writeFileSync(join(directory, "gh"), `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CALLS"
case "$*" in
  "api repos/brandon-y-lee/helix/git/ref/heads/dev --jq .object.sha") echo "$DEV_HEAD";;
  "api repos/brandon-y-lee/helix/git/ref/heads/${mirror} --jq .object.sha") echo "$MIRROR_HEAD";;
  "api --method PATCH repos/brandon-y-lee/helix/git/refs/heads/${mirror} -f sha=$GITHUB_SHA -F force=false --jq .object.sha")
    [ "$REJECT" = false ] && echo "$GITHUB_SHA";;
  *) echo "Unexpected GitHub API call" >&2; exit 1;;
esac
`, { mode: 0o700 });
  execFileSync("/bin/bash", ["-c", script], {
    env: {
      NODE_ENV: "test",
      PATH: directory + ":" + process.env.PATH, CALLS: calls, DEV_HEAD: devHead, MIRROR_HEAD: mirrorHead,
      REJECT: String(rejectUpdate), GITHUB_REPOSITORY: "brandon-y-lee/helix", GITHUB_SHA: candidate,
      GITHUB_STEP_SUMMARY: join(directory, "summary"),
    },
    stdio: "pipe",
  });
  return readFileSync(calls, "utf8");
}

it("fast-forwards only the fixed preview ref, once, to the protected dev commit", () => {
  expect(run(candidate, previous).match(/--method PATCH/g)).toHaveLength(1);
  expect(run(candidate, candidate)).not.toContain("PATCH");
});

it("skips a superseded push and fails on a rejected fast-forward", () => {
  expect(run(previous, previous)).not.toContain("PATCH");
  expect(() => run(candidate, previous, true)).toThrow();
});
