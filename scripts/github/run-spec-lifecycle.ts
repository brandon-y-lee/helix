import { readFile } from "node:fs/promises";

import { createSpecLifecycleAdapters } from "./spec-lifecycle-adapters";
import {
  runSpecLifecycle,
  type SpecLifecycleCommand,
} from "./spec-integration-lifecycle";

function parseArgs(argv: string[]): { repository: string; commandFile: string } {
  argv = argv.filter((argument) => argument !== "--");
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value) throw new Error("flags require values");
    values.set(flag, value);
  }
  const repository = values.get("--repo");
  const commandFile = values.get("--command-file");
  if (repository !== "brandon-y-lee/mei-pelle" || !commandFile) {
    throw new Error("usage: run-spec-lifecycle --repo brandon-y-lee/mei-pelle --command-file <json>");
  }
  return { repository, commandFile };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_REPOSITORY !== options.repository ||
    !process.env.GH_TOKEN
  ) {
    throw new Error("spec lifecycle mutations require the trusted GitHub Actions orchestrator");
  }
  const command = JSON.parse(await readFile(options.commandFile, "utf8")) as SpecLifecycleCommand;
  const report = await runSpecLifecycle(
    command,
    createSpecLifecycleAdapters(options.repository),
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`spec-lifecycle: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
