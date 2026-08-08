import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import {
  BROWSER_VERIFICATION_PLAN as plan,
  type BrowserVerificationJourney,
} from "./browser-verification-plan";
import {
  verifyFreshProductionArtifact,
  type NodeProductionVerificationAdapters,
} from "./production-verification";

type AffectedBrowserVerificationAdapters = NodeProductionVerificationAdapters & {
  readChangedFiles: (baseRef: string) => Promise<readonly string[]>;
};

type AffectedBrowserVerificationCommandInput = {
  adapters: AffectedBrowserVerificationAdapters;
  argv: readonly string[];
  env: Partial<NodeJS.ProcessEnv>;
  log: (message: string) => void;
  signal?: AbortSignal;
};

const execFileAsync = promisify(execFile);

type SelectedJourney = {
  capabilities: string[];
  journey: BrowserVerificationJourney;
  reason: string;
};

function readBaseRef(argv: readonly string[], env: Partial<NodeJS.ProcessEnv>) {
  const baseIndex = argv.indexOf("--base");
  return baseIndex >= 0 ? argv[baseIndex + 1] : env.GITHUB_BASE_REF ?? "dev";
}

function readAddedValues(argv: readonly string[], flag: string): string[] {
  return argv.flatMap((value, index) =>
    value === flag && argv[index + 1] ? [argv[index + 1]!] : [],
  );
}

function validateOptions(argv: readonly string[]): void {
  const supported = new Set(["--add-capability", "--add-journey", "--base"]);
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]!;
    if (!supported.has(option)) {
      throw new Error(`Unsupported affected-verification option "${option}".`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Affected verification option "${option}" requires a value.`);
    }
  }
}

export async function readAffectedBrowserVerificationChangedFiles(
  cwd: string,
  baseRef: string,
): Promise<string[]> {
  const { stdout: baseShaOutput } = await execFileAsync(
    "git",
    ["rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`],
    { cwd, encoding: "utf8" },
  );
  const baseSha = String(baseShaOutput).trim();
  const { stdout: mergeBaseOutput } = await execFileAsync(
    "git",
    ["merge-base", baseSha, "HEAD"],
    { cwd, encoding: "utf8" },
  );
  const mergeBase = String(mergeBaseOutput).trim();
  const [{ stdout: changedOutput }, { stdout: untrackedOutput }] =
    await Promise.all([
      execFileAsync(
        "git",
        [
          "diff",
          "--name-only",
          "--diff-filter=ACMRTUXB",
          mergeBase,
          "--",
        ],
        { cwd, encoding: "utf8" },
      ),
      execFileAsync("git", ["ls-files", "--others", "--exclude-standard"], {
        cwd,
        encoding: "utf8",
      }),
    ]);
  return Array.from(
    new Set(
      `${changedOutput}\n${untrackedOutput}`
        .split("\n")
        .map((file) => file.trim())
        .filter(Boolean),
    ),
  ).sort();
}

export async function runAffectedBrowserVerificationCommand(
  input: AffectedBrowserVerificationCommandInput,
) {
  const argv = input.argv[0] === "--" ? input.argv.slice(1) : input.argv;
  validateOptions(argv);
  const baseRef = readBaseRef(argv, input.env);
  if (!baseRef) throw new Error("Affected verification requires a base ref.");
  const changedFiles = await input.adapters.readChangedFiles(baseRef);
  const classifiedFiles = changedFiles.map((file) => ({
    capabilities: Array.from(
      new Set(
        plan.pathRules.flatMap((rule) =>
          file.startsWith(rule.prefix) ? [...rule.capabilities] : [],
        ),
      ),
    ),
    file,
  }));
  const unmappedFile = changedFiles.find(
    (file) =>
      classifiedFiles.find((classified) => classified.file === file)
        ?.capabilities.length === 0,
  );
  for (const { capabilities, file } of classifiedFiles) {
    for (const capability of capabilities) {
      input.log(`${file} maps to ${capability}.`);
    }
  }
  const selectedJourneyIds = new Set<string>();
  const selections = classifiedFiles.flatMap(({ capabilities, file }) =>
    plan.journeys.flatMap((journey) => {
      const matchingCapabilities = capabilities.filter((capability) =>
        journey.capabilities.some((declared) => declared === capability),
      );
      if (
        selectedJourneyIds.has(journey.id) ||
        matchingCapabilities.length === 0
      ) {
        return [];
      }
      selectedJourneyIds.add(journey.id);
      return [
        {
          capabilities: matchingCapabilities,
          journey,
          reason: `${file} maps to ${matchingCapabilities[0]}.`,
        },
      ];
    }),
  );
  const selectedJourneys: SelectedJourney[] = unmappedFile
    ? plan.journeys.map((journey) => ({
        capabilities: [...plan.webkitCapabilities],
        journey,
        reason: `${unmappedFile} is not mapped by Browser Verification Plan v${plan.version}; selected the complete plan.`,
      }))
    : selections;
  if (!unmappedFile) {
    const knownCapabilities = new Set<string>(
      plan.journeys.flatMap((journey) => [...journey.capabilities]),
    );
    for (const capability of readAddedValues(argv, "--add-capability")) {
      if (!knownCapabilities.has(capability)) {
        throw new Error(`Unknown browser capability "${capability}".`);
      }
      for (const journey of plan.journeys) {
        if (
          journey.capabilities.some((declared) => declared === capability) &&
          !selectedJourneyIds.has(journey.id)
        ) {
          selectedJourneyIds.add(journey.id);
          selectedJourneys.push({
            capabilities: [capability],
            journey,
            reason: `explicit capability ${capability} was added by the caller.`,
          });
        }
      }
    }
    for (const journeyId of readAddedValues(argv, "--add-journey")) {
      const journey = plan.journeys.find((candidate) => candidate.id === journeyId);
      if (!journey) throw new Error(`Unknown browser journey "${journeyId}".`);
      if (!selectedJourneyIds.has(journey.id)) {
        selectedJourneyIds.add(journey.id);
        selectedJourneys.push({
          capabilities: [...journey.capabilities],
          journey,
          reason: `explicit journey ${journeyId} was added by the caller.`,
        });
      }
    }
  }

  const fingerprint = `sha256:${createHash("sha256")
    .update(JSON.stringify(plan))
    .digest("hex")}`;
  const webkitJourneys = unmappedFile
    ? selectedJourneys
    : selectedJourneys.filter(({ capabilities }) =>
        capabilities.some((capability) =>
          plan.webkitCapabilities.some((webkit) => webkit === capability),
        ),
      );
  const requiresWebkit = webkitJourneys.length > 0;
  const projects = requiresWebkit
    ? plan.projects
    : ([plan.projects[0]] as const);
  for (const project of projects) {
    const projectJourneys =
      project === "webkit" ? webkitJourneys : selectedJourneys;
    for (const { journey, reason } of projectJourneys) {
      input.log(`Selected ${project} / ${journey.id}: ${reason}`);
    }
  }
  const result = await verifyFreshProductionArtifact(
    {
      browserSelection: {
        journeyIds: selectedJourneys.map(({ journey }) => journey.id),
        projects,
        ...(requiresWebkit
          ? {
              webkitJourneyIds: webkitJourneys.map(
                ({ journey }) => journey.id,
              ),
            }
          : {}),
      },
      requestedPort: input.env.PORT,
      signal: input.signal,
    },
    input.adapters,
  );

  return { ...result, baseRef, fingerprint };
}
