import { createHash } from "node:crypto";

import { BROWSER_VERIFICATION_PLAN } from "../browser-verification-plan";
import type { ProductionVerificationBrowserSelection } from "../production-verification";
import {
  runScheduledBrowserVerification,
  type ScheduledBrowserVerificationAdapter,
} from "./verification-orchestrator";
import type {
  OperationalVerificationIssueAdapter,
  ScheduledVerificationFailure,
  ScheduledVerificationIdentity,
  Sha256Fingerprint,
} from "./verification-orchestrator";

const OPERATIONAL_ISSUE_TITLE = "Scheduled WebKit verification failure";
const STATE_PREFIX = "<!-- mei-pelle:scheduled-webkit-state ";
const STATE_SUFFIX = " -->";

type ScheduledBrowserVerificationDependencies = {
  browserVersion: string;
  readCatalogIdentity(): Promise<string>;
  readPlanIdentity(): string;
  readRuntimeIdentity(): Promise<string>;
  verifyProduction(selection: ProductionVerificationBrowserSelection): Promise<void>;
};

function fingerprint(value: string): Sha256Fingerprint {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function isFingerprint(value: unknown): value is Sha256Fingerprint {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isScheduledVerificationFailure(value: unknown): value is ScheduledVerificationFailure {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const failure = value as Partial<ScheduledVerificationFailure>;
  const identity = failure.identity as Partial<ScheduledVerificationIdentity> | undefined;
  return (
    typeof failure.summary === "string" &&
    (failure.kind === "browser-failed" ||
      failure.kind === "catalog-unavailable" ||
      failure.kind === "setup-failed") &&
    identity?.browser?.name === "webkit" &&
    typeof identity.browser.version === "string" &&
    isFingerprint(identity.catalogFingerprint) &&
    isFingerprint(identity.planFingerprint) &&
    isFingerprint(identity.runtimeFingerprint)
  );
}

export function scheduledVerificationIssueBody(
  failure: ScheduledVerificationFailure,
  runUrl: string,
): string {
  return [
    "## Active scheduled verification failure",
    "",
    failure.summary,
    "",
    `Latest evidence: ${runUrl}`,
    "",
    "Production promotion remains blocked until matching clean WebKit evidence closes this issue.",
    "This state does not revert or remove code from `dev`.",
    "",
    `${STATE_PREFIX}${JSON.stringify(failure)}${STATE_SUFFIX}`,
  ].join("\n");
}

export function parseScheduledVerificationIssueBody(
  body: string,
): ScheduledVerificationFailure | undefined {
  const line = body.split("\n").find(
    (candidate) => candidate.startsWith(STATE_PREFIX) && candidate.endsWith(STATE_SUFFIX),
  );
  if (!line) return undefined;
  try {
    const value: unknown = JSON.parse(
      line.slice(STATE_PREFIX.length, -STATE_SUFFIX.length),
    );
    return isScheduledVerificationFailure(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export interface ScheduledVerificationGitHubCommandAdapter {
  run(args: string[]): Promise<{ stdout: string }>;
}

export function createOperationalVerificationIssueAdapter(input: {
  commands: ScheduledVerificationGitHubCommandAdapter;
  repository: string;
  runUrl: string;
}): OperationalVerificationIssueAdapter {
  const body = (failure: ScheduledVerificationFailure) =>
    scheduledVerificationIssueBody(failure, input.runUrl);
  return {
    async findActive() {
      const result = await input.commands.run([
        "issue",
        "list",
        "--repo",
        input.repository,
        "--state",
        "open",
        "--search",
        `${OPERATIONAL_ISSUE_TITLE} in:title`,
        "--limit",
        "100",
        "--json",
        "number,title,body",
      ]);
      const issues = JSON.parse(result.stdout) as Array<{
        body: string;
        number: number;
        title: string;
      }>;
      const active = issues.filter((issue) => issue.title === OPERATIONAL_ISSUE_TITLE);
      if (active.length > 1) {
        throw new Error("Multiple active scheduled WebKit failure issues require operator reconciliation.");
      }
      const issue = active[0];
      if (!issue) return undefined;
      const failure = parseScheduledVerificationIssueBody(issue.body);
      if (!failure) {
        throw new Error("The active scheduled WebKit failure issue has invalid state.");
      }
      return { ...failure, number: issue.number };
    },
    async create(failure) {
      const result = await input.commands.run([
        "issue",
        "create",
        "--repo",
        input.repository,
        "--title",
        OPERATIONAL_ISSUE_TITLE,
        "--body",
        body(failure),
      ]);
      const number = Number(result.stdout.trim().match(/\/issues\/(\d+)\/?$/)?.[1]);
      if (!Number.isSafeInteger(number) || number <= 0) {
        throw new Error("GitHub did not return the created operational issue number.");
      }
      return { number };
    },
    async update(number, failure) {
      await input.commands.run([
        "issue",
        "edit",
        String(number),
        "--repo",
        input.repository,
        "--body",
        body(failure),
      ]);
    },
    async close(number, recovery) {
      await input.commands.run([
        "issue",
        "close",
        String(number),
        "--repo",
        input.repository,
        "--comment",
        `Recovered with matching clean WebKit evidence at ${input.runUrl}: ${JSON.stringify(recovery)}. Production promotion is no longer blocked by this issue.`,
      ]);
    },
  };
}

export async function runScheduledBrowserVerificationCommand(input: {
  argv: readonly string[];
  issues: OperationalVerificationIssueAdapter;
  log(message: string): void;
  verification: ScheduledBrowserVerificationAdapter;
}) {
  const argv = input.argv[0] === "--" ? input.argv.slice(1) : [...input.argv];
  if (argv.length !== 2 || argv[0] !== "--lane" || argv[1] !== "webkit") {
    throw new Error("Scheduled browser verification requires exactly --lane webkit.");
  }
  const report = await runScheduledBrowserVerification({
    issues: input.issues,
    verification: input.verification,
  });
  input.log(JSON.stringify(report));
  return report;
}

export function createScheduledBrowserVerificationAdapter(
  dependencies: ScheduledBrowserVerificationDependencies,
): ScheduledBrowserVerificationAdapter {
  return {
    async verifyCompleteWebkit() {
      const runtimeIdentity = await dependencies.readRuntimeIdentity();
      if (!dependencies.browserVersion.trim()) {
        throw new Error("Scheduled verification requires a WebKit version.");
      }
      const baseIdentity = {
        browser: {
          name: "webkit" as const,
          version: `playwright-webkit-${dependencies.browserVersion}`,
        },
        planFingerprint: fingerprint(dependencies.readPlanIdentity()),
        runtimeFingerprint: fingerprint(runtimeIdentity),
      };
      let catalogIdentity: string;
      try {
        catalogIdentity = await dependencies.readCatalogIdentity();
      } catch {
        return {
          identity: {
            ...baseIdentity,
            catalogFingerprint: fingerprint("catalog-unavailable"),
          },
          failureKind: "catalog-unavailable",
          outcome: "failed",
        };
      }
      const identity = {
        ...baseIdentity,
        catalogFingerprint: fingerprint(catalogIdentity),
      };
      const journeyIds = BROWSER_VERIFICATION_PLAN.journeys.map(
        (journey) => journey.id,
      );
      try {
        await dependencies.verifyProduction({
          journeyIds,
          projects: ["webkit"],
          webkitJourneyIds: journeyIds,
        });
        return { identity, outcome: "passed" };
      } catch {
        return { failureKind: "browser-failed", identity, outcome: "failed" };
      }
    },
  };
}
