import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import {
  BROWSER_VERIFICATION_PLAN as plan,
  type BrowserVerificationJourney,
} from "./browser-verification-plan";
import {
  verifyReusableProductionArtifact,
  type NodeProductionVerificationAdapters,
  type ProductionVerificationDiagnostic,
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
          "--diff-filter=ACDMRTUXB",
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
        plan.pathRules.flatMap((rule) => {
          const matches =
            rule.match === "exact"
              ? file === rule.path
              : file.startsWith(rule.path);
          return matches ? [...rule.capabilities] : [];
        }),
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
  const selectedJourneyById = new Map<string, SelectedJourney>();
  const selectedJourneys: SelectedJourney[] = [];
  const addSelection = (
    journey: BrowserVerificationJourney,
    capabilities: readonly string[],
    reason: string,
  ) => {
    const existing = selectedJourneyById.get(journey.id);
    if (existing) {
      existing.capabilities = Array.from(
        new Set([...existing.capabilities, ...capabilities]),
      );
      if (!existing.reason.includes(reason)) {
        existing.reason = `${existing.reason.replace(/\.$/, "")}; ${reason}`;
      }
      return;
    }
    const selection = { capabilities: [...capabilities], journey, reason };
    selectedJourneyById.set(journey.id, selection);
    selectedJourneys.push(selection);
  };

  if (unmappedFile) {
    for (const journey of plan.journeys) {
      addSelection(
        journey,
        journey.capabilities,
        `${unmappedFile} is not mapped by Browser Verification Plan v${plan.version}; selected the complete plan.`,
      );
    }
  } else {
    for (const { capabilities, file } of classifiedFiles) {
      for (const journey of plan.journeys) {
        const matchingCapabilities = capabilities.filter((capability) =>
          journey.capabilities.some((declared) => declared === capability),
        );
        if (matchingCapabilities.length > 0) {
          addSelection(
            journey,
            matchingCapabilities,
            `${file} maps to ${matchingCapabilities[0]}.`,
          );
        }
      }
    }
    const knownCapabilities = new Set<string>(
      plan.journeys.flatMap((journey) => [...journey.capabilities]),
    );
    for (const capability of readAddedValues(argv, "--add-capability")) {
      if (!knownCapabilities.has(capability)) {
        throw new Error(`Unknown browser capability "${capability}".`);
      }
      for (const journey of plan.journeys) {
        if (journey.capabilities.some((declared) => declared === capability)) {
          addSelection(
            journey,
            [capability],
            `explicit capability ${capability} was added by the caller.`,
          );
        }
      }
    }
    for (const journeyId of readAddedValues(argv, "--add-journey")) {
      const journey = plan.journeys.find((candidate) => candidate.id === journeyId);
      if (!journey) throw new Error(`Unknown browser journey "${journeyId}".`);
      addSelection(
        journey,
        journey.capabilities,
        `explicit journey ${journeyId} was added by the caller.`,
      );
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
  const projectNames = plan.projects.map(({ name }) => name);
  const projects = requiresWebkit
    ? projectNames
    : ([projectNames[0]] as const);
  for (const project of projects) {
    const projectJourneys =
      project === "webkit" ? webkitJourneys : selectedJourneys;
    for (const { journey, reason } of projectJourneys) {
      input.log(`Selected ${project} / ${journey.id}: ${reason}`);
    }
  }
  const diagnostics: ProductionVerificationDiagnostic[] = [];
  const phaseDuration = (phase: ProductionVerificationDiagnostic["phase"]) => {
    const started = diagnostics.find(
      (diagnostic) =>
        diagnostic.phase === phase && diagnostic.status === "started",
    );
    const completed = [...diagnostics].reverse().find(
      (diagnostic) =>
        diagnostic.phase === phase && diagnostic.status !== "started",
    );
    return started && completed
      ? Math.max(0, completed.elapsedMs - started.elapsedMs)
      : 0;
  };
  const telemetryBase = (retries = 0) => ({
    browserTimeMs: phaseDuration("browser-test"),
    buildTimeMs: phaseDuration("production-build"),
    capabilities: Array.from(
      new Set(selectedJourneys.flatMap(({ capabilities }) => capabilities)),
    ),
    journeyCount:
      selectedJourneys.length + (requiresWebkit ? webkitJourneys.length : 0),
    projects: [...projects],
    retries,
  });
  let result;
  try {
    result = await verifyReusableProductionArtifact(
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
      {
        ...input.adapters,
        report: (diagnostic) => {
          diagnostics.push(diagnostic);
          input.adapters.report(diagnostic);
        },
      },
    );
  } catch (error) {
    const reuseStatus =
      typeof error === "object" &&
      error !== null &&
      (error as { reuseStatus?: unknown }).reuseStatus === "reused"
        ? ("reused" as const)
        : ("new" as const);
    const invalidationReason =
      typeof error === "object" &&
      error !== null &&
      typeof (error as { invalidationReason?: unknown }).invalidationReason ===
        "string"
        ? (error as { invalidationReason: string }).invalidationReason
        : "verification failed before reuse evaluation";
    const failure = [...diagnostics]
      .reverse()
      .find((diagnostic) => diagnostic.status === "failed");
    const telemetry = {
      ...telemetryBase(
        typeof (error as { retryCount?: unknown })?.retryCount === "number"
          ? (error as { retryCount: number }).retryCount
          : 0,
      ),
      failureClassification: failure?.phase ?? "preflight",
      outcome: "failed" as const,
      reuseStatus,
    };
    input.log(
      `Production build reuse: ${reuseStatus} (${invalidationReason}).`,
    );
    input.log(`[affected-verification-result] ${JSON.stringify(telemetry)}`);
    throw error;
  }
  input.log(
    `Production build reuse: ${result.reuseStatus} (${result.invalidationReason}).`,
  );

  const telemetry = {
    ...telemetryBase(result.retries),
    outcome: "passed" as const,
    reuseStatus: result.reuseStatus,
  };
  input.log(`[affected-verification-result] ${JSON.stringify(telemetry)}`);

  return { ...result, baseRef, fingerprint, telemetry };
}
