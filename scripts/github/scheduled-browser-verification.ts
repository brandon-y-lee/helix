import { BROWSER_VERIFICATION_PLAN } from "../browser-verification-plan";
import type { ProductionVerificationBrowserSelection } from "../production-verification";
import {
  runScheduledBrowserVerification,
  type ScheduledBrowserVerificationAdapter,
} from "./verification-orchestrator";
import type {
  OperationalVerificationIssueAdapter,
  ScheduledVerificationFailure,
  Sha256Fingerprint,
} from "./verification-orchestrator";
import {
  createOperationalVerificationIssueAdapter as createIssueAdapter,
  parseScheduledVerificationIssueBody as parseIssueBody,
  scheduledVerificationIssueBody as issueBody,
} from "./scheduled-verification-issue.mjs";
import { fingerprint } from "./scheduled-verification-runtime.mjs";

const verificationFingerprint = (value: string): Sha256Fingerprint =>
  fingerprint(value) as Sha256Fingerprint;

type ScheduledBrowserVerificationDependencies = {
  browserVersion: string;
  readCatalogIdentity(): Promise<string>;
  readPlanIdentity(): string;
  readRuntimeIdentity(): Promise<string>;
  verifyProduction(selection: ProductionVerificationBrowserSelection): Promise<void>;
};

export function scheduledVerificationIssueBody(
  failure: ScheduledVerificationFailure,
  runUrl: string,
): string {
  return issueBody(failure, runUrl);
}

export function parseScheduledVerificationIssueBody(
  body: string,
): ScheduledVerificationFailure | undefined {
  return parseIssueBody(body) as ScheduledVerificationFailure | undefined;
}

export interface ScheduledVerificationGitHubCommandAdapter {
  run(args: string[]): Promise<{ stdout: string }>;
}

export function createOperationalVerificationIssueAdapter(input: {
  commands: ScheduledVerificationGitHubCommandAdapter;
  repository: string;
  runUrl: string;
}): OperationalVerificationIssueAdapter {
  return createIssueAdapter(input) as OperationalVerificationIssueAdapter;
}

export async function runScheduledBrowserVerificationCommand(input: {
  argv: readonly string[];
  issues: OperationalVerificationIssueAdapter;
  log(message: string): void;
  onEvidenceClassified?: Parameters<typeof runScheduledBrowserVerification>[0]["onEvidenceClassified"];
  verification: ScheduledBrowserVerificationAdapter;
}) {
  const argv = input.argv[0] === "--" ? input.argv.slice(1) : [...input.argv];
  if (argv.length !== 2 || argv[0] !== "--lane" || argv[1] !== "webkit") {
    throw new Error("Scheduled browser verification requires exactly --lane webkit.");
  }
  const report = await runScheduledBrowserVerification({
    issues: input.issues,
    onEvidenceClassified: input.onEvidenceClassified,
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
        planFingerprint: verificationFingerprint(dependencies.readPlanIdentity()),
        runtimeFingerprint: verificationFingerprint(runtimeIdentity),
      };
      let catalogIdentity: string;
      try {
        catalogIdentity = await dependencies.readCatalogIdentity();
      } catch {
        return {
          identity: {
            ...baseIdentity,
            catalogFingerprint: verificationFingerprint("catalog-unavailable"),
          },
          failureKind: "catalog-unavailable",
          outcome: "failed",
        };
      }
      const identity = {
        ...baseIdentity,
        catalogFingerprint: verificationFingerprint(catalogIdentity),
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
