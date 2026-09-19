import { describe, expect, it } from "vitest";
import { parsePaymentReplayInput } from "@/lib/admin/payments/input";

const request = {
  itemId: "22222222-2222-4222-8222-222222222222",
  expectedVersion: 4,
  reason: "Provider connection restored",
  requestId: "11111111-1111-4111-8111-111111111111",
};

describe("payment replay request boundary", () => {
  it("defaults a valid exact replay request to inspection only", () => {
    expect(parsePaymentReplayInput(request)).toEqual({ ...request, dryRun: true });
  });
  it("accepts only a boolean apply instruction and normalizes the reviewed reason", () => {
    expect(parsePaymentReplayInput({ ...request, reason: "  Provider connection restored  ", dryRun: false }))
      .toEqual({ ...request, dryRun: false });
  });

  it.each([
    null, [], { ...request, actorId: "another-user" },
    { ...request, accountId: "acct_another" }, { ...request, itemId: "cs_test_session" },
    { ...request, expectedVersion: 0 }, { ...request, expectedVersion: 1.5 },
    { ...request, expectedVersion: 2147483648 },
    { ...request, expectedVersion: Number.MAX_SAFE_INTEGER + 1 },
    { ...request, reason: " " }, { ...request, reason: "x".repeat(241) },
    { ...request, reason: "A reason with\nnew lines" },
    { ...request, requestId: "random" }, { ...request, dryRun: "false" },
    { ...request, dryRun: null },
  ])("rejects invalid or authority-bearing input %j", (value) => {
    expect(() => parsePaymentReplayInput(value)).toThrow();
  });
  it("normalizes UUIDs so database identities compare exactly", () => {
    const requestId = "ABCDEF01-1234-4234-8234-ABCDEF012345";
    expect(parsePaymentReplayInput({ ...request, itemId: requestId, requestId }))
      .toMatchObject({ itemId: requestId.toLowerCase(), requestId: requestId.toLowerCase() });
  });

});
