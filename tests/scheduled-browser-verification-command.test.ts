import { describe, expect, it } from "vitest";

import {
  createOperationalVerificationIssueAdapter,
  createScheduledBrowserVerificationAdapter,
  parseScheduledVerificationIssueBody,
  runScheduledBrowserVerificationCommand,
  scheduledVerificationIssueBody,
} from "@/scripts/github/scheduled-browser-verification";
import type { ScheduledVerificationFailure } from "@/scripts/github/verification-orchestrator";

const completeJourneyIds = [
  "catalog-preview",
  "product-discovery",
  "editorial-navigation",
  "footer-support",
  "homepage-hero",
  "header-navigation",
  "routine-selector",
  "header-search",
  "storefront-purchase",
];

describe("scheduled browser verification command adapter", () => {
  it("accepts only the complete WebKit lane and returns the orchestrator report", async () => {
    const logs: string[] = [];
    const report = await runScheduledBrowserVerificationCommand({
      argv: ["--", "--lane", "webkit"],
      issues: {
        async findActive() { return undefined; },
        async create() { return { number: 154 }; },
        async update() {},
        async close() {},
      },
      log(message) { logs.push(message); },
      verification: {
        async verifyCompleteWebkit() {
          return {
            identity: {
              browser: { name: "webkit", version: "playwright-webkit-1.55.1" },
              catalogFingerprint: "sha256:catalog-1",
              planFingerprint: "sha256:plan-1",
              runtimeFingerprint: "git:0123456789abcdef0123456789abcdef01234567",
            },
            outcome: "failed",
          };
        },
      },
    });

    expect(report).toMatchObject({
      issueNumber: 154,
      outcome: "failed",
      productionPromotion: "blocked",
    });
    expect(logs).toEqual([JSON.stringify(report)]);
    await expect(
      runScheduledBrowserVerificationCommand({
        argv: ["--lane", "chromium"],
        issues: {} as never,
        log() {},
        verification: {} as never,
      }),
    ).rejects.toThrow("requires exactly --lane webkit");
  });

  it("runs the complete WebKit plan with hashed runtime, plan, browser, and Catalog identity", async () => {
    const selections: unknown[] = [];
    const adapter = createScheduledBrowserVerificationAdapter({
      browserVersion: "1.55.1",
      async readCatalogIdentity() {
        return "catalog-identity";
      },
      readPlanIdentity() {
        return "plan-identity";
      },
      async readRuntimeSha() {
        return "0123456789abcdef0123456789abcdef01234567";
      },
      async verifyProduction(selection) {
        selections.push(selection);
      },
    });

    const result = await adapter.verifyCompleteWebkit();

    expect(result).toEqual({
      identity: {
        browser: { name: "webkit", version: "playwright-webkit-1.55.1" },
        catalogFingerprint: "sha256:8ba687ae900ffd3df31448e5eb655bd42adc19c0111b3ae5e5e19226d4a96792",
        planFingerprint: "sha256:f6b2eaa4c3b54c7bb824963dc786d5ade3fdf44336e2b53af3440353598c892b",
        runtimeFingerprint: "git:0123456789abcdef0123456789abcdef01234567",
      },
      outcome: "passed",
    });
    expect(selections).toEqual([
      {
        journeyIds: completeJourneyIds,
        projects: ["webkit"],
        webkitJourneyIds: completeJourneyIds,
      },
    ]);
  });

  it("retains the exact failed input identity when complete WebKit verification fails", async () => {
    const adapter = createScheduledBrowserVerificationAdapter({
      browserVersion: "1.55.1",
      async readCatalogIdentity() {
        return "catalog-identity";
      },
      readPlanIdentity() {
        return "plan-identity";
      },
      async readRuntimeSha() {
        return "0123456789abcdef0123456789abcdef01234567";
      },
      async verifyProduction() {
        throw new Error("controlled WebKit failure");
      },
    });

    await expect(adapter.verifyCompleteWebkit()).resolves.toMatchObject({
      identity: {
        catalogFingerprint: "sha256:8ba687ae900ffd3df31448e5eb655bd42adc19c0111b3ae5e5e19226d4a96792",
        planFingerprint: "sha256:f6b2eaa4c3b54c7bb824963dc786d5ade3fdf44336e2b53af3440353598c892b",
        runtimeFingerprint: "git:0123456789abcdef0123456789abcdef01234567",
      },
      outcome: "failed",
    });
  });

  it("returns non-sensitive failure identity when current Catalog facts are unavailable", async () => {
    let verificationCalls = 0;
    const adapter = createScheduledBrowserVerificationAdapter({
      browserVersion: "1.55.1",
      async readCatalogIdentity() {
        throw new Error("raw provider failure");
      },
      readPlanIdentity() {
        return "plan-identity";
      },
      async readRuntimeSha() {
        return "0123456789abcdef0123456789abcdef01234567";
      },
      async verifyProduction() {
        verificationCalls += 1;
      },
    });

    await expect(adapter.verifyCompleteWebkit()).resolves.toEqual({
      identity: {
        browser: { name: "webkit", version: "playwright-webkit-1.55.1" },
        catalogFingerprint: "sha256:f43b26123c04ddcd8e6c6da928f7988022926fdbc2afc0939ee6c3c96c5827ad",
        planFingerprint: "sha256:f6b2eaa4c3b54c7bb824963dc786d5ade3fdf44336e2b53af3440353598c892b",
        runtimeFingerprint: "git:0123456789abcdef0123456789abcdef01234567",
      },
      outcome: "failed",
    });
    expect(verificationCalls).toBe(0);
  });

  it("round-trips the active failure identity without raw Catalog facts", () => {
    const failure: ScheduledVerificationFailure = {
      identity: {
        browser: { name: "webkit", version: "playwright-webkit-1.55.1" },
        catalogFingerprint: "sha256:catalog-1",
        planFingerprint: "sha256:plan-1",
        runtimeFingerprint: "git:0123456789abcdef0123456789abcdef01234567",
      },
      summary: "Complete WebKit verification failed for current dev and Catalog facts.",
    };

    const body = scheduledVerificationIssueBody(
      failure,
      "https://github.com/brandon-y-lee/mei-pelle/actions/runs/123",
    );

    expect(body).toContain("Production promotion remains blocked");
    expect(body).toContain("https://github.com/brandon-y-lee/mei-pelle/actions/runs/123");
    expect(body).not.toContain("Product One");
    expect(parseScheduledVerificationIssueBody(body)).toEqual(failure);
  });

  it("uses one exact-title GitHub issue for create, update, and matching close", async () => {
    const calls: string[][] = [];
    const failure: ScheduledVerificationFailure = {
      identity: {
        browser: { name: "webkit", version: "playwright-webkit-1.55.1" },
        catalogFingerprint: "sha256:catalog-1",
        planFingerprint: "sha256:plan-1",
        runtimeFingerprint: "git:0123456789abcdef0123456789abcdef01234567",
      },
      summary: "Complete WebKit verification failed for current dev and Catalog facts.",
    };
    const existingBody = scheduledVerificationIssueBody(
      failure,
      "https://github.com/brandon-y-lee/mei-pelle/actions/runs/122",
    );
    const adapter = createOperationalVerificationIssueAdapter({
      repository: "brandon-y-lee/mei-pelle",
      runUrl: "https://github.com/brandon-y-lee/mei-pelle/actions/runs/123",
      commands: {
        async run(args) {
          calls.push(args);
          if (args[0] === "issue" && args[1] === "list") {
            return {
              stdout: JSON.stringify([
                {
                  body: existingBody,
                  number: 154,
                  title: "Scheduled WebKit verification failure",
                },
              ]),
            };
          }
          if (args[0] === "issue" && args[1] === "create") {
            return { stdout: "https://github.com/brandon-y-lee/mei-pelle/issues/155\n" };
          }
          return { stdout: "" };
        },
      },
    });

    await expect(adapter.findActive()).resolves.toEqual({
      ...failure,
      number: 154,
    });
    await expect(adapter.create(failure)).resolves.toEqual({ number: 155 });
    await adapter.update(154, failure);
    await adapter.close(154, failure.identity);

    expect(calls.map((args) => args.slice(0, 2))).toEqual([
      ["issue", "list"],
      ["issue", "create"],
      ["issue", "edit"],
      ["issue", "close"],
    ]);
    expect(calls[0]).toEqual(expect.arrayContaining([
      "--state",
      "open",
      "--search",
      "Scheduled WebKit verification failure in:title",
    ]));
    expect(calls[2]).toEqual(expect.arrayContaining(["154", "--body"]));
    expect(calls[3]).toEqual(expect.arrayContaining([
      "154",
      "--comment",
      expect.stringContaining("matching clean WebKit evidence"),
    ]));
  });
});
