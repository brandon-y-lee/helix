import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const classifier = resolve(process.cwd(), "scripts/github/verification-system-paths.mjs");

describe("verification-system path classifier command", () => {
  it.each([
    ["app/page.tsx\n", "false\n"],
    ["tests/verification-receipt-command.test.ts\n", "true\n"],
    ["vercel.json\n", "true\n"],
  ])("reports a successful explicit result for %s", async (paths, expected) => {
    const directory = await mkdtemp(resolve(tmpdir(), "mei-pelle-path-classifier-"));
    const changedFiles = resolve(directory, "changed-files.txt");
    await writeFile(changedFiles, paths, "utf8");

    await expect(execFileAsync(process.execPath, [classifier, changedFiles]))
      .resolves.toMatchObject({ stdout: expected });
  });

  it("fails when changed paths cannot be read", async () => {
    await expect(execFileAsync(process.execPath, [classifier, "/missing/changed-files.txt"]))
      .rejects.toMatchObject({ code: 1 });
  });
});
