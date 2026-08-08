export type WorkflowIssue = {
  number: number;
  state: "open" | "closed";
  labels: string[];
  assignees: string[];
  parentNumber?: number;
  blockedBy: number[];
};

export type WorkflowBranch = {
  name: string;
  sha: string;
  parent: string | null;
};

export type WorkflowPullRequest = {
  number: number;
  state: "open" | "closed" | "merged";
  headBranch: string;
  baseBranch: string;
  headSha: string;
  draft: boolean;
  checks: Record<string, "pending" | "passed" | "failed">;
  body: string;
  ticketNumber?: number;
  reviewPassed: boolean;
  mergeable: boolean;
  mergeMethod?: "squash" | "merge";
  mergeSha?: string;
};

export interface SpecGithubAdapter {
  protectSpecBranch(input: {
    branch: string;
    directPushes: false;
    allowedMergeMethods: ["squash"];
    requiredChecks: ["ci", "affected-browser-verification"];
  }): Promise<void>;
}

export interface SpecGitAdapter {
  readBranch(name: string): Promise<WorkflowBranch | null>;
  createBranch(input: { name: string; fromBranch: string; fromSha: string }): Promise<void>;
  deleteBranch(name: string): Promise<void>;
  updateSpecFromDev?(input: {
    branch: string;
    expectedSpecSha: string;
    devSha: string;
    reason: "declared-dependency" | "urgent-assumption-breaking";
  }): Promise<{ sha: string }>;
}

export interface SpecIssueAdapter {
  read(number: number): Promise<WorkflowIssue>;
  listChildren(specNumber: number): Promise<WorkflowIssue[]>;
  update(number: number, update: Partial<Pick<WorkflowIssue, "state" | "labels" | "assignees">>): Promise<void>;
  comment(number: number, body: string): Promise<void>;
}

export interface SpecPullRequestAdapter {
  find(headBranch: string, baseBranch: string): Promise<WorkflowPullRequest | null>;
  read(number: number): Promise<WorkflowPullRequest>;
  create(input: {
    headBranch: string;
    baseBranch: string;
    draft: boolean;
    title: string;
    body: string;
  }): Promise<WorkflowPullRequest>;
  update(number: number, update: Partial<Pick<WorkflowPullRequest, "state" | "draft" | "body">>): Promise<void>;
  merge(number: number, input: { expectedHeadSha: string; method: "squash" | "merge" }): Promise<{ mergeSha: string }>;
}

export interface SpecVerificationAdapter {
  readCombinedFailure(input: {
    specNumber: number;
    pullRequestNumber: number;
  }): Promise<{ reason: string; responsibleChildNumber?: number }>;
}

export type SpecLifecycleAdapters = {
  github: SpecGithubAdapter;
  git: SpecGitAdapter;
  issues: SpecIssueAdapter;
  pullRequests: SpecPullRequestAdapter;
  verification?: SpecVerificationAdapter;
};

export type SpecLifecycleCommand =
  | {
      kind: "create-spec";
      specNumber: number;
      specSlug: string;
    }
  | {
      kind: "start-child";
      specNumber: number;
      specSlug: string;
      childNumber: number;
      childSlug: string;
      assignee: string;
    }
  | {
      kind: "integrate-child";
      specNumber: number;
      specSlug: string;
      childNumber: number;
      pullRequestNumber: number;
    }
  | {
      kind: "ready-spec";
      specNumber: number;
      specSlug: string;
    }
  | {
      kind: "combined-failure";
      specNumber: number;
      specSlug: string;
    }
  | {
      kind: "cancel-spec";
      specNumber: number;
      specSlug: string;
      reason: string;
      replacementIssues: number[];
    }
  | {
      kind: "complete-spec";
      specNumber: number;
      specSlug: string;
      pullRequestNumber: number;
    }
  | {
      kind: "sync-spec";
      specNumber: number;
      specSlug: string;
      reason: "declared-dependency" | "urgent-assumption-breaking";
    };

export type SpecLifecycleReport =
  | {
      outcome: "spec-created";
      specNumber: number;
      branch: string;
      devSha: string;
    }
  | {
      outcome: "child-started";
      specNumber: number;
      childNumber: number;
      branch: string;
      baseBranch: string;
      baseSha: string;
    }
  | {
      outcome: "child-integrated";
      specNumber: number;
      childNumber: number;
      mergeSha: string;
      finalPullRequest: number;
      finalDraft: true;
    }
  | {
      outcome: "spec-ready";
      specNumber: number;
      pullRequestNumber: number;
    }
  | {
      outcome: "child-reopened";
      specNumber: number;
      childNumber: number;
      pullRequestNumber: number;
    }
  | {
      outcome: "integration-owned-failure";
      specNumber: number;
      pullRequestNumber: number;
    }
  | {
      outcome: "spec-cancelled";
      specNumber: number;
      pullRequestNumber: number;
      replacements: number[];
    }
  | {
      outcome: "spec-completed";
      specNumber: number;
      pullRequestNumber: number;
      mergeSha: string;
    }
  | {
      outcome: "spec-synced";
      specNumber: number;
      previousSpecSha: string;
      devSha: string;
      specSha: string;
      reason: "declared-dependency" | "urgent-assumption-breaking";
    };

function validateSlug(slug: string, kind: "spec" | "child"): void {
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(slug)) {
    throw new Error(`${kind} slug must use lowercase letters, digits, dots, underscores, or hyphens`);
  }
}

function specBranch(specNumber: number, specSlug: string): string {
  validateSlug(specSlug, "spec");
  return `codex/spec-${specNumber}-${specSlug}`;
}

function finalSpecBody(
  specNumber: number,
  branch: string,
  children: WorkflowIssue[],
): string {
  const facts = children
    .map((child) => ({
      number: child.number,
      blockers: [...child.blockedBy].sort((left, right) => left - right),
      integrated:
        child.state === "closed" && child.labels.includes("workflow:spec-integrated"),
    }))
    .sort((left, right) => left.number - right.number);
  const checklist = facts
    .map(
      (child) =>
        `- [${child.integrated ? "x" : " "}] #${child.number} (blockers: ${child.blockers.length ? child.blockers.map((number) => `#${number}`).join(", ") : "none"})`,
    )
    .join("\n");
  return [
    "## Workflow path",
    "",
    "- Path: completed spec",
    "- Base: dev",
    "- Refs: N/A",
    `- Spec: #${specNumber}`,
    "- Urgency: not urgent",
    "- Fast-path proof: N/A",
    "",
    `## Spec #${specNumber} integration status`,
    "",
    "<!-- mei-pelle-spec-lifecycle:v1",
    JSON.stringify({ spec: specNumber, branch, children: facts }),
    "-->",
    "",
    checklist,
    "",
    "### Code-review outcome",
    "",
    "- Standards: pending",
    "- Spec: pending",
  ].join("\n");
}

function labelsForState(issue: WorkflowIssue, state: string): string[] {
  return issue.labels
    .filter(
      (label) =>
        !label.startsWith("workflow:") &&
        label !== "ready-for-agent" &&
        label !== "wontfix",
    )
    .concat(state);
}

function labelsWithoutWorkflowState(issue: WorkflowIssue): string[] {
  return issue.labels.filter(
    (label) =>
      !label.startsWith("workflow:") &&
      label !== "ready-for-agent" &&
      label !== "wontfix",
  );
}

function validateCommand(command: SpecLifecycleCommand): void {
  const allowedKinds = new Set<SpecLifecycleCommand["kind"]>([
    "create-spec",
    "start-child",
    "integrate-child",
    "ready-spec",
    "combined-failure",
    "cancel-spec",
    "complete-spec",
    "sync-spec",
  ]);
  if (!allowedKinds.has(command.kind)) throw new Error("unknown spec lifecycle command");
  for (const [name, value] of Object.entries(command)) {
    if (name.endsWith("Number") && (!Number.isInteger(value) || Number(value) <= 0)) {
      throw new Error(`${name} must be a positive integer`);
    }
  }
}

export async function runSpecLifecycle(
  command: SpecLifecycleCommand,
  adapters: SpecLifecycleAdapters,
): Promise<SpecLifecycleReport> {
  validateCommand(command);
  if (command.specNumber === 50) {
    throw new Error("spec #50 remains on the previously executable workflow");
  }
  const spec = await adapters.issues.read(command.specNumber);
  if (spec.state !== "open" || !spec.labels.includes("type:spec")) {
    throw new Error(`spec #${command.specNumber} must be an open type:spec issue`);
  }
  const branch = specBranch(command.specNumber, command.specSlug);
  if (command.kind === "start-child") {
    const base = await adapters.git.readBranch(branch);
    if (!base) throw new Error(`spec branch ${branch} does not exist`);
    const child = await adapters.issues.read(command.childNumber);
    if (
      child.state !== "open" ||
      child.parentNumber !== command.specNumber ||
      !child.labels.includes("type:ticket") ||
      !child.labels.includes("ready-for-agent") ||
      child.assignees.length > 0
    ) {
      throw new Error(
        `child #${command.childNumber} must be open, unassigned, ready-for-agent, and belong to spec #${command.specNumber}`,
      );
    }
    for (const blockerNumber of child.blockedBy) {
      const blocker = await adapters.issues.read(blockerNumber);
      if (
        blocker.state !== "closed" ||
        !blocker.labels.includes("workflow:spec-integrated")
      ) {
        throw new Error(`blocker #${blockerNumber} has not entered the spec branch`);
      }
    }
    validateSlug(command.childSlug, "child");
    const childBranch = `codex/${command.childNumber}-${command.childSlug}`;
    if (await adapters.git.readBranch(childBranch)) {
      throw new Error(`ticket branch ${childBranch} already exists`);
    }
    let parentAdvanced = false;
    let branchCreated = false;
    try {
      await adapters.issues.update(command.childNumber, {
        assignees: [command.assignee],
        labels: labelsForState(child, "workflow:in-progress"),
      });
      if (spec.labels.includes("workflow:planned")) {
        await adapters.issues.update(command.specNumber, {
          labels: labelsForState(spec, "workflow:in-progress"),
        });
        parentAdvanced = true;
      }
      await adapters.git.createBranch({
        name: childBranch,
        fromBranch: branch,
        fromSha: base.sha,
      });
      branchCreated = true;
      await adapters.issues.comment(
        command.childNumber,
        `<!-- mei-pelle-ticket-branch:v1 ${JSON.stringify({ branch: childBranch, baseBranch: branch, baseSha: base.sha })} -->\nStarted from the current parent spec tip \`${base.sha}\`.`,
      );
    } catch (error) {
      if (branchCreated) await adapters.git.deleteBranch(childBranch);
      await adapters.issues.update(command.childNumber, {
        assignees: child.assignees,
        labels: child.labels,
      });
      if (parentAdvanced) {
        await adapters.issues.update(command.specNumber, { labels: spec.labels });
      }
      throw error;
    }
    return {
      outcome: "child-started",
      specNumber: command.specNumber,
      childNumber: command.childNumber,
      branch: childBranch,
      baseBranch: branch,
      baseSha: base.sha,
    };
  }
  if (command.kind === "integrate-child") {
    const specBranchFact = await adapters.git.readBranch(branch);
    if (!specBranchFact) throw new Error(`spec branch ${branch} does not exist`);
    const child = await adapters.issues.read(command.childNumber);
    if (
      child.state !== "open" ||
      child.parentNumber !== command.specNumber ||
      !child.labels.includes("type:ticket") ||
      !child.labels.includes("workflow:review")
    ) {
      throw new Error("child ticket must be in workflow:review and remain open in its parent spec");
    }
    const pullRequest = await adapters.pullRequests.read(command.pullRequestNumber);
    const ticketBranch = await adapters.git.readBranch(pullRequest.headBranch);
    if (
      pullRequest.state !== "open" ||
      pullRequest.draft ||
      !pullRequest.mergeable ||
      !pullRequest.reviewPassed ||
      pullRequest.ticketNumber !== command.childNumber ||
      pullRequest.baseBranch !== branch ||
      !ticketBranch ||
      ticketBranch.parent !== branch ||
      ticketBranch.sha !== pullRequest.headSha
    ) {
      throw new Error("child pull request must be reviewed, conflict-free, bound to its ticket, and use a flat branch targeting its spec branch");
    }
    for (const check of ["ci", "affected-browser-verification"] as const) {
      if (pullRequest.checks[check] !== "passed") {
        throw new Error(`child pull request requires passing ${check}`);
      }
    }
    const merged = await adapters.pullRequests.merge(command.pullRequestNumber, {
      expectedHeadSha: pullRequest.headSha,
      method: "squash",
    });
    await adapters.issues.update(command.childNumber, {
      state: "closed",
      labels: labelsForState(child, "workflow:spec-integrated"),
    });
    await adapters.issues.comment(
      command.childNumber,
      `Ticket #${command.childNumber} squash-integrated by PR #${command.pullRequestNumber} into \`${branch}\` at \`${merged.mergeSha}\`. Native dependencies may now use the closed \`workflow:spec-integrated\` state.`,
    );

    const children = await adapters.issues.listChildren(command.specNumber);
    const body = finalSpecBody(command.specNumber, branch, children);
    let finalPullRequest = await adapters.pullRequests.find(branch, "dev");
    if (!finalPullRequest) {
      try {
        finalPullRequest = await adapters.pullRequests.create({
          headBranch: branch,
          baseBranch: "dev",
          draft: true,
          title: `Integrate spec #${command.specNumber}`,
          body,
        });
      } catch (error) {
        finalPullRequest = await adapters.pullRequests.find(branch, "dev");
        if (!finalPullRequest) throw error;
        await adapters.pullRequests.update(finalPullRequest.number, { body, draft: true });
      }
    } else {
      await adapters.pullRequests.update(finalPullRequest.number, { body, draft: true });
    }
    return {
      outcome: "child-integrated",
      specNumber: command.specNumber,
      childNumber: command.childNumber,
      mergeSha: merged.mergeSha,
      finalPullRequest: finalPullRequest.number,
      finalDraft: true,
    };
  }
  if (command.kind === "ready-spec") {
    const children = await adapters.issues.listChildren(command.specNumber);
    if (
      children.length === 0 ||
      children.some(
        (child) =>
          child.state !== "closed" ||
          !child.labels.includes("workflow:spec-integrated"),
      )
    ) {
      throw new Error("every required child must be spec-integrated");
    }
    const finalPullRequest = await adapters.pullRequests.find(branch, "dev");
    if (!finalPullRequest || finalPullRequest.state !== "open") {
      throw new Error("the draft final spec pull request does not exist");
    }
    if (!finalPullRequest.reviewPassed || !finalPullRequest.mergeable) {
      throw new Error("combined code review must pass and the final pull request must be conflict-free");
    }
    await adapters.pullRequests.update(finalPullRequest.number, {
      draft: false,
    });
    await adapters.issues.update(command.specNumber, {
      labels: labelsForState(spec, "workflow:review"),
    });
    return {
      outcome: "spec-ready",
      specNumber: command.specNumber,
      pullRequestNumber: finalPullRequest.number,
    };
  }
  if (command.kind === "combined-failure") {
    if (!adapters.verification) {
      throw new Error("combined failure requires the controlled verification adapter");
    }
    const finalPullRequest = await adapters.pullRequests.find(branch, "dev");
    if (!finalPullRequest || finalPullRequest.state !== "open") {
      throw new Error("the final spec pull request does not exist");
    }
    const failure = await adapters.verification.readCombinedFailure({
      specNumber: command.specNumber,
      pullRequestNumber: finalPullRequest.number,
    });
    if (!failure.reason.trim()) throw new Error("combined failure evidence requires a reason");
    const responsibleChild = failure.responsibleChildNumber === undefined
      ? undefined
      : await adapters.issues.read(failure.responsibleChildNumber);
    if (responsibleChild && responsibleChild.parentNumber !== command.specNumber) {
      throw new Error(`child #${failure.responsibleChildNumber} does not belong to spec #${command.specNumber}`);
    }
    await adapters.pullRequests.update(finalPullRequest.number, {
      draft: true,
      body: `${finalPullRequest.body}\n\n## Combined verification failure\n\n${failure.reason}`,
    });
    if (responsibleChild) {
      const child = responsibleChild;
      await adapters.issues.update(child.number, {
        state: "open",
        labels: labelsForState(child, "workflow:review"),
      });
      await adapters.issues.comment(
        child.number,
        `Reopened after combined verification identified this ticket as responsible: ${failure.reason}`,
      );
      return {
        outcome: "child-reopened",
        specNumber: command.specNumber,
        childNumber: child.number,
        pullRequestNumber: finalPullRequest.number,
      };
    }
    await adapters.issues.comment(
      command.specNumber,
      `Combined verification failed without a proven ticket owner; ownership remains with spec integration: ${failure.reason}`,
    );
    return {
      outcome: "integration-owned-failure",
      specNumber: command.specNumber,
      pullRequestNumber: finalPullRequest.number,
    };
  }
  if (command.kind === "cancel-spec") {
    if (!command.reason.trim()) throw new Error("spec cancellation requires a reason");
    const finalPullRequest = await adapters.pullRequests.find(branch, "dev");
    if (!finalPullRequest || finalPullRequest.state !== "open") {
      throw new Error("the open final spec pull request does not exist");
    }
    const replacements = [...new Set(command.replacementIssues)].sort((left, right) => left - right);
    const replacementText = replacements.length
      ? replacements.map((number) => `#${number}`).join(", ")
      : "none";
    await adapters.pullRequests.update(finalPullRequest.number, {
      state: "closed",
      draft: true,
      body: `${finalPullRequest.body}\n\n## Cancelled\n\n${command.reason}\n\nReplacement issues: ${replacementText}`,
    });
    const children = await adapters.issues.listChildren(command.specNumber);
    for (const child of children) {
      await adapters.issues.update(child.number, {
        state: "closed",
        labels: labelsForState(child, "wontfix"),
      });
      await adapters.issues.comment(
        child.number,
        `Closed because parent spec #${command.specNumber} was cancelled: ${command.reason}. Replacement issues: ${replacementText}.`,
      );
    }
    await adapters.issues.update(command.specNumber, {
      state: "closed",
      labels: labelsForState(spec, "wontfix"),
    });
    await adapters.issues.comment(
      command.specNumber,
      `Cancelled without integration into dev: ${command.reason}. Replacement issues: ${replacementText}.`,
    );
    await adapters.git.deleteBranch(branch);
    return {
      outcome: "spec-cancelled",
      specNumber: command.specNumber,
      pullRequestNumber: finalPullRequest.number,
      replacements,
    };
  }
  if (command.kind === "complete-spec") {
    const children = await adapters.issues.listChildren(command.specNumber);
    if (
      children.length === 0 ||
      children.some(
        (child) => child.state !== "closed" || !child.labels.includes("workflow:spec-integrated"),
      )
    ) {
      throw new Error("every required child must remain spec-integrated");
    }
    const finalPullRequest = await adapters.pullRequests.read(command.pullRequestNumber);
    if (
      finalPullRequest.state !== "merged" ||
      finalPullRequest.headBranch !== branch ||
      finalPullRequest.baseBranch !== "dev" ||
      finalPullRequest.mergeMethod !== "merge" ||
      !finalPullRequest.mergeSha
    ) {
      throw new Error("final spec pull request must be regular-merged into dev");
    }
    await adapters.issues.update(command.specNumber, {
      state: "closed",
      labels: labelsWithoutWorkflowState(spec),
    });
    await adapters.issues.comment(
      command.specNumber,
      `Completed by regular-merged PR #${finalPullRequest.number} into dev at \`${finalPullRequest.mergeSha}\`; child ticket commits remain visible behind the spec boundary.`,
    );
    await adapters.git.deleteBranch(branch);
    return {
      outcome: "spec-completed",
      specNumber: command.specNumber,
      pullRequestNumber: finalPullRequest.number,
      mergeSha: finalPullRequest.mergeSha,
    };
  }
  if (command.kind === "sync-spec") {
    if (
      command.reason !== "declared-dependency" &&
      command.reason !== "urgent-assumption-breaking"
    ) {
      throw new Error(
        "early spec updates require a declared dependency or urgent assumption break",
      );
    }
    if (!adapters.git.updateSpecFromDev) {
      throw new Error("the controlled Git adapter does not support early spec updates");
    }
    const [currentSpec, dev] = await Promise.all([
      adapters.git.readBranch(branch),
      adapters.git.readBranch("dev"),
    ]);
    if (!currentSpec || !dev) throw new Error("the spec branch and dev must both exist");
    const updated = await adapters.git.updateSpecFromDev({
      branch,
      expectedSpecSha: currentSpec.sha,
      devSha: dev.sha,
      reason: command.reason,
    });
    await adapters.issues.comment(
      command.specNumber,
      `Updated \`${branch}\` from dev \`${dev.sha}\` for ${command.reason}; new spec tip \`${updated.sha}\`.`,
    );
    return {
      outcome: "spec-synced",
      specNumber: command.specNumber,
      previousSpecSha: currentSpec.sha,
      devSha: dev.sha,
      specSha: updated.sha,
      reason: command.reason,
    };
  }
  if (await adapters.git.readBranch(branch)) {
    throw new Error(`spec branch ${branch} already exists`);
  }
  const dev = await adapters.git.readBranch("dev");
  if (!dev) throw new Error("dev branch does not exist");
  if (!spec.labels.includes("workflow:planned")) {
    throw new Error(`spec #${command.specNumber} must be workflow:planned before branch creation`);
  }
  await adapters.git.createBranch({ name: branch, fromBranch: "dev", fromSha: dev.sha });
  try {
    await adapters.github.protectSpecBranch({
      branch,
      directPushes: false,
      allowedMergeMethods: ["squash"],
      requiredChecks: ["ci", "affected-browser-verification"],
    });
  } catch (error) {
    await adapters.git.deleteBranch(branch);
    throw error;
  }
  return {
    outcome: "spec-created",
    specNumber: command.specNumber,
    branch,
    devSha: dev.sha,
  };
}
