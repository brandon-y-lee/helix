import { describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createRepositoryAdapter,
  createVerificationAdapter,
  requestIntegrationHandoff,
  toIntegrationCandidate,
  type CommandAdapter,
} from "@/scripts/github/run-integration-coordinator";

function pullRequestFact(overrides: Record<string, unknown> = {}) {
  return {
    number: 52,
    baseRefName: "dev",
    headRefOid: "a".repeat(40),
    isDraft: false,
    mergeable: "MERGEABLE",
    createdAt: "2026-08-08T07:00:00.000Z",
    updatedAt: "2026-08-08T08:00:00.000Z",
    body: "## Workflow path\n\n- Path: normal ticket\n- Fast-path proof: N/A\n",
    labels: [{ name: "workflow:integration-queued" }],
    files: [{ path: ".github/workflows/dev-integration.yml" }],
    statusCheckRollup: [
      { name: "ci", status: "COMPLETED", conclusion: "SUCCESS" },
      {
        name: "verification-lifecycle-windows",
        status: "COMPLETED",
        conclusion: "SUCCESS",
      },
      {
        name: "verification-system-browser-gate",
        status: "COMPLETED",
        conclusion: "SUCCESS",
      },
    ],
    ...overrides,
  };
}

describe("GitHub Integration Coordinator adapter", () => {
  it("routes production verification through the public orchestrator seam", async () => {
    let seamInvoked = false;
    const adapter = createVerificationAdapter(
      "brandon-y-lee/mei-pelle",
      "530-1",
      { async run() { throw new Error("transport should remain controlled"); } },
      () => {
        seamInvoked = true;
        return { async verify() { return { outcome: "passed" }; } };
      },
    );

    await expect(adapter.verify({
      number: 53,
      baseSha: "b".repeat(40),
      headSha: "c".repeat(40),
      candidateSha: "d".repeat(40),
      gate: "complete-behavioral",
      reasons: ["verification-system retains the complete behavioral gate"],
      timeoutMs: 20 * 60 * 1_000,
      signal: new AbortController().signal,
    })).resolves.toEqual({ outcome: "passed" });
    expect(seamInvoked).toBe(true);
  });

  it("returns observed verification telemetry from the dispatched workflow artifact", async () => {
    const commands: CommandAdapter = {
      async run(_command, args) {
        if (args[0] === "workflow") return { stdout: "", stderr: "", status: 0 };
        if (args[0] === "run" && args[1] === "list") {
          return {
            stdout: JSON.stringify([{
              databaseId: 530,
              displayTitle: "Integration verification #53 530-1",
            }]),
            stderr: "",
            status: 0,
          };
        }
        if (args[0] === "run" && args[1] === "watch") {
          return { stdout: "", stderr: "", status: 0 };
        }
        if (args[0] === "run" && args[1] === "download") {
          const directory = args[args.indexOf("--dir") + 1]!;
          await writeFile(
            resolve(directory, "verification-browser-result.json"),
            JSON.stringify({
              telemetry: {
                browserCaseExecutions: 9,
                buildReuse: "new",
                completePlanRuns: 1,
                failureClassification: "unstable",
                retries: 1,
                selectedCapabilities: ["complete-plan"],
                testTimeMs: 5_000,
              },
            }),
          );
          return { stdout: "", stderr: "", status: 0 };
        }
        throw new Error(`unexpected command: ${args.join(" ")}`);
      },
    };
    const adapter = createVerificationAdapter(
      "brandon-y-lee/mei-pelle",
      "530-1",
      commands,
    );

    await expect(adapter.verify({
      number: 53,
      baseSha: "b".repeat(40),
      headSha: "c".repeat(40),
      candidateSha: "d".repeat(40),
      gate: "complete-behavioral",
      reasons: ["verification-system retains the complete behavioral gate"],
      timeoutMs: 20 * 60 * 1_000,
      signal: new AbortController().signal,
    })).resolves.toEqual({
      outcome: "passed",
      telemetry: {
        browserCaseExecutions: 9,
        buildReuse: "new",
        completePlanRuns: 1,
        failureClassification: "unstable",
        retries: 1,
        selectedCapabilities: ["complete-plan"],
        testTimeMs: 5_000,
        workflowRunId: 530,
      },
    });
  });

  it("fails closed to verification-system work from current pull-request facts", () => {
    const candidate = toIntegrationCandidate(pullRequestFact({
      statusCheckRollup: [
        { name: "ci", status: "COMPLETED", conclusion: "SUCCESS" },
      ],
    }));

    expect(candidate).toEqual({
      number: 52,
      target: "dev",
      createdAt: "2026-08-08T07:00:00.000Z",
      implementationCompletedAt: "2026-08-08T07:00:00.000Z",
      queuedAt: undefined,
      headSha: "a".repeat(40),
      readyAt: "2026-08-08T07:00:00.000Z",
      workClass: "verification-system",
      changedFiles: [".github/workflows/dev-integration.yml"],
      fastPathProof: undefined,
      riskAreas: ["provider", "cross-cutting"],
      labels: ["workflow:integration-queued"],
      ready: false,
    });
  });

  it("admits verification-system work only after Linux, browser, and Windows preflight pass", () => {
    expect(toIntegrationCandidate(pullRequestFact()).ready).toBe(true);
  });

  it("keeps verification-system work out of the slot until the stable browser gate passes", () => {
    const candidate = toIntegrationCandidate(pullRequestFact({
      statusCheckRollup: [
        { name: "ci", status: "COMPLETED", conclusion: "SUCCESS" },
        {
          name: "verification-lifecycle-windows",
          status: "COMPLETED",
          conclusion: "SUCCESS",
        },
      ],
    }));

    expect(candidate.ready).toBe(false);
  });

  it("keeps the existing CI-only readiness gate for non-verification work", () => {
    const candidate = toIntegrationCandidate(pullRequestFact({
      body: "## Workflow path\n\n- Path: standalone ticket\n- Fast-path proof: N/A\n",
      files: [{ path: "components/product/ProductCard.tsx" }],
      statusCheckRollup: [
        { name: "ci", status: "COMPLETED", conclusion: "SUCCESS" },
      ],
    }));

    expect(candidate.workClass).toBe("standalone");
    expect(candidate.ready).toBe(true);
  });

  it.each([
    ".nvmrc",
    "package.json",
    "pnpm-lock.yaml",
    "playwright.config.ts",
    "scripts/affected-browser-verification.ts",
    "scripts/browser-verification-plan.ts",
    "scripts/verify-affected.ts",
    "tests/affected-browser-verification-command.test.ts",
    "tests/github-workflow-tools.test.ts",
    "tests/helpers/production-verification.ts",
    "tests/prepare-integration-candidate.test.ts",
    "tests/routine-browser-verification.test.ts",
    "tests/verification-fingerprints.test.ts",
    "tests/verification-receipt-command.test.ts",
    "tests/spec-integration-lifecycle.test.ts",
    "tests/spec-lifecycle-adapters.test.ts",
  ])("keeps affected browser verification changes on the verification-system gate: %s", (path) => {
    const candidate = toIntegrationCandidate(
      pullRequestFact({
        body: "## Workflow path\n\n- Path: trivial\n- Fast-path proof: N/A\n",
        files: [{ path }],
      }),
    );

    expect(candidate.workClass).toBe("verification-system");
  });

  it("keeps review handoffs out of the ready queue", () => {
    const candidate = toIntegrationCandidate(
      pullRequestFact({ labels: [{ name: "workflow:review" }] }),
    );

    expect(candidate.ready).toBe(false);
  });

  it("requires exact changed-path proof for a trivial fast path", () => {
    const candidate = toIntegrationCandidate(
      pullRequestFact({
        body: [
          "## Workflow path",
          "",
          "- Path: trivial",
          "- Fast-path proof: `docs/operator-guide.md`, `README.md`",
        ].join("\n"),
        files: [{ path: "README.md" }, { path: "docs/operator-guide.md" }],
      }),
    );

    expect(candidate.fastPathProof).toEqual(["README.md", "docs/operator-guide.md"]);
  });

  it("records implementation completion and the actual Integration queue transition", async () => {
    const commands: CommandAdapter = {
      async run(_command, args) {
        const joined = args.join(" ");
        if (joined.includes("git/ref/heads/dev")) {
          return { stdout: `${"d".repeat(40)}\n`, stderr: "", status: 0 };
        }
        if (args[0] === "pr" && args[1] === "list") {
          return {
            stdout: JSON.stringify([pullRequestFact({ labels: [] })]),
            stderr: "",
            status: 0,
          };
        }
        if (args[0] === "api" && args[1] === "graphql") {
          return {
            stdout: JSON.stringify({
              data: {
                repository: {
                  pullRequests: {
                    nodes: [{
                      number: 52,
                      createdAt: "2026-08-08T07:00:00.000Z",
                      timelineItems: {
                        nodes: [
                          {
                            __typename: "ReadyForReviewEvent",
                            createdAt: "2026-08-08T07:30:00.000Z",
                          },
                          {
                            __typename: "LabeledEvent",
                            createdAt: "2026-08-08T08:00:00.000Z",
                            label: { name: "workflow:integration-queued" },
                          },
                        ],
                      },
                    }],
                  },
                },
              },
            }),
            stderr: "",
            status: 0,
          };
        }
        throw new Error(`unexpected command: ${joined}`);
      },
    };

    const snapshot = await createRepositoryAdapter("owner/repo", commands).read();

    expect(snapshot.candidates[0]).toMatchObject({
      implementationCompletedAt: "2026-08-08T07:30:00.000Z",
      queuedAt: "2026-08-08T08:00:00.000Z",
      readyAt: "2026-08-08T08:00:00.000Z",
    });
  });

  it("compensates a changed-input claim so no false active owner remains", async () => {
    let readCount = 0;
    const edits: string[][] = [];
    const commands: CommandAdapter = {
      async run(_command, args) {
        const joined = args.join(" ");
        if (joined.includes("git/ref/heads/dev")) {
          return { stdout: `${"d".repeat(40)}\n`, stderr: "", status: 0 };
        }
        if (args[0] === "pr" && args[1] === "list") {
          readCount += 1;
          return {
            stdout: JSON.stringify([
              pullRequestFact({
                headRefOid: (readCount === 1 ? "a" : "b").repeat(40),
                labels: [
                  { name: readCount === 1 ? "workflow:integration-queued" : "workflow:integration-active" },
                ],
              }),
            ]),
            stderr: "",
            status: 0,
          };
        }
        if (args[0] === "api" && args[1] === "graphql") {
          return {
            stdout: JSON.stringify({
              data: {
                repository: {
                  pullRequests: {
                    nodes: [{
                      number: 52,
                      createdAt: "2026-08-08T07:00:00.000Z",
                      timelineItems: { nodes: [] },
                    }],
                  },
                },
              },
            }),
            stderr: "",
            status: 0,
          };
        }
        if (args[0] === "issue" && args[1] === "edit") {
          edits.push(args);
          return { stdout: "", stderr: "", status: 0 };
        }
        throw new Error(`unexpected command: ${joined}`);
      },
    };
    const repository = createRepositoryAdapter("owner/repo", commands);

    await expect(
      repository.claim({ number: 52, baseSha: "d".repeat(40), headSha: "a".repeat(40) }),
    ).resolves.toBe(false);

    expect(edits).toHaveLength(2);
    expect(edits[1]).toEqual(expect.arrayContaining([
      "--add-label",
      "workflow:review",
      "--remove-label",
      "workflow:integration-active",
    ]));
  });

  it("serializes production claims so simultaneous attempts expose one winner", async () => {
    const facts = [
      pullRequestFact({ number: 52, headRefOid: "a".repeat(40) }),
      pullRequestFact({ number: 53, headRefOid: "b".repeat(40) }),
    ];
    const commands: CommandAdapter = {
      async run(_command, args) {
        const joined = args.join(" ");
        if (joined.includes("git/ref/heads/dev")) {
          return { stdout: `${"d".repeat(40)}\n`, stderr: "", status: 0 };
        }
        if (args[0] === "pr" && args[1] === "list") {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return { stdout: JSON.stringify(facts), stderr: "", status: 0 };
        }
        if (args[0] === "api" && args[1] === "graphql") {
          return {
            stdout: JSON.stringify({
              data: {
                repository: {
                  pullRequests: {
                    nodes: facts.map((fact) => ({
                      number: fact.number,
                      createdAt: fact.createdAt,
                      timelineItems: { nodes: [] },
                    })),
                  },
                },
              },
            }),
            stderr: "",
            status: 0,
          };
        }
        if (args[0] === "issue" && args[1] === "edit") {
          const number = Number(args[2]);
          const fact = facts.find((entry) => entry.number === number)!;
          const add = args.flatMap((arg, index) => arg === "--add-label" ? [args[index + 1]!] : []);
          const remove = args.flatMap((arg, index) => arg === "--remove-label" ? [args[index + 1]!] : []);
          fact.labels = fact.labels.filter((label) => !remove.includes(label.name));
          for (const name of add) {
            if (!fact.labels.some((label) => label.name === name)) fact.labels.push({ name });
          }
          return { stdout: "", stderr: "", status: 0 };
        }
        throw new Error(`unexpected command: ${joined}`);
      },
    };
    const repository = createRepositoryAdapter("owner/repo", commands);

    const results = await Promise.all([
      repository.claim({ number: 52, baseSha: "d".repeat(40), headSha: "a".repeat(40) }),
      repository.claim({ number: 53, baseSha: "d".repeat(40), headSha: "b".repeat(40) }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(facts.flatMap((fact) => fact.labels).filter((label) => label.name === "workflow:integration-active"))
      .toHaveLength(1);
  });

  it("dispatches automatic handoff as a fresh trusted coordinator run", async () => {
    const calls: string[][] = [];
    const commands: CommandAdapter = {
      async run(_command, args) {
        calls.push(args);
        return { stdout: "", stderr: "", status: 0 };
      },
    };

    await requestIntegrationHandoff("owner/repo", commands);

    expect(calls).toEqual([[
      "workflow",
      "run",
      "dev-integration.yml",
      "--repo",
      "owner/repo",
      "--ref",
      "dev",
    ]]);
  });
});
