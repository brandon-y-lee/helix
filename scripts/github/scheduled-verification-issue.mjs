export const OPERATIONAL_ISSUE_TITLE = "Scheduled WebKit verification failure";
export const STATE_PREFIX = "<!-- mei-pelle:scheduled-webkit-state ";
export const STATE_SUFFIX = " -->";

function isFingerprint(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isScheduledVerificationFailure(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const identity = value.identity;
  return (
    typeof value.summary === "string" &&
    ["browser-failed", "catalog-unavailable", "reconciliation-failed", "setup-failed"].includes(value.kind) &&
    identity?.browser?.name === "webkit" &&
    typeof identity.browser.version === "string" &&
    isFingerprint(identity.catalogFingerprint) &&
    isFingerprint(identity.planFingerprint) &&
    isFingerprint(identity.runtimeFingerprint)
  );
}

export function scheduledFailureFromClassifiedEvidence(result) {
  if (!result || typeof result !== "object" || !result.identity) return undefined;
  const probe = {
    kind: "reconciliation-failed",
    identity: result.identity,
    summary: "probe",
  };
  if (!isScheduledVerificationFailure(probe)) return undefined;
  if (result.outcome === "passed") {
    return {
      kind: "reconciliation-failed",
      identity: result.identity,
      summary: "Operational issue reconciliation failed after complete WebKit verification passed.",
    };
  }
  if (result.outcome !== "failed") return undefined;
  if (result.failureKind === "catalog-unavailable") {
    return {
      kind: "catalog-unavailable",
      identity: result.identity,
      summary: "Scheduled verification could not read current Catalog facts, so WebKit did not run.",
    };
  }
  if (result.failureKind === "browser-failed") {
    return {
      kind: "browser-failed",
      identity: result.identity,
      summary: "Complete WebKit verification failed for current dev and Catalog facts.",
    };
  }
  return undefined;
}

export function scheduledVerificationIssueBody(failure, runUrl) {
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

export function parseScheduledVerificationIssueBody(body) {
  const line = body.split("\n").find(
    (candidate) => candidate.startsWith(STATE_PREFIX) && candidate.endsWith(STATE_SUFFIX),
  );
  if (!line) return undefined;
  try {
    const value = JSON.parse(line.slice(STATE_PREFIX.length, -STATE_SUFFIX.length));
    return isScheduledVerificationFailure(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function createOperationalVerificationIssueAdapter(input) {
  const body = (failure) => scheduledVerificationIssueBody(failure, input.runUrl);
  return {
    async findActive() {
      const result = await input.commands.run([
        "issue", "list", "--repo", input.repository, "--state", "open",
        "--search", `${OPERATIONAL_ISSUE_TITLE} in:title`, "--limit", "100",
        "--json", "number,title,body",
      ]);
      const active = JSON.parse(result.stdout).filter(
        (issue) => issue.title === OPERATIONAL_ISSUE_TITLE,
      );
      if (active.length > 1) {
        throw new Error("Multiple active scheduled WebKit failure issues require operator reconciliation.");
      }
      const issue = active[0];
      if (!issue) return undefined;
      const failure = parseScheduledVerificationIssueBody(issue.body);
      if (!failure) throw new Error("The active scheduled WebKit failure issue has invalid state.");
      return { ...failure, number: issue.number };
    },
    async create(failure) {
      const result = await input.commands.run([
        "issue", "create", "--repo", input.repository,
        "--title", OPERATIONAL_ISSUE_TITLE, "--body", body(failure),
      ]);
      const number = Number(result.stdout.trim().match(/\/issues\/(\d+)\/?$/)?.[1]);
      if (!Number.isSafeInteger(number) || number <= 0) {
        throw new Error("GitHub did not return the created operational issue number.");
      }
      return { number };
    },
    async update(number, failure) {
      await input.commands.run([
        "issue", "edit", String(number), "--repo", input.repository, "--body", body(failure),
      ]);
    },
    async close(number, recovery) {
      await input.commands.run([
        "issue", "close", String(number), "--repo", input.repository, "--comment",
        `Recovered with matching clean WebKit evidence at ${input.runUrl}: ${JSON.stringify(recovery)}. Production promotion is no longer blocked by this issue.`,
      ]);
    },
  };
}

export async function recordScheduledVerificationFailure(issues, failure) {
  const active = await issues.findActive();
  if (active) {
    await issues.update(active.number, failure);
    return active.number;
  }
  return (await issues.create(failure)).number;
}
