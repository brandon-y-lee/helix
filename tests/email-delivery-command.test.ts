import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { parseEmailDeliveryCommand, runEmailDeliveryCommand } from "../scripts/email-delivery";
const id = "f83164ef-c327-44ae-bbb4-bbd25d254abc";
const env = { HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted",
  NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-service-key" };
const operation = { subscriberId: id, generation: 2, importState: "retry_wait", attemptCount: 1,
  nextSubmissionAt: "2026-09-29T22:00:00+00:00", providerImportId: null,
  firstFailure: { category: "rate_limited", httpStatus: 429, providerName: "rate_limit_exceeded", retryAfterSeconds: 60 },
  currentGeneration: 2, currentConsentStatus: "confirmed" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});
it("defaults inspection and retries to read-only operator plans", () => {
  expect(parseEmailDeliveryCommand(["inspect"])).toMatchObject({ apply: false, id: null });
  expect(parseEmailDeliveryCommand(["retry", "--id", id, "--expected-updated-at", "2026-09-28T00:00:00Z"])).toMatchObject({ apply: false });
});
it("requires a message, drift boundary, and exact project before applying a retry", () => {
  const args = ["retry", "--id", id, "--expected-updated-at", "2026-09-28T00:00:00Z", "--apply"];
  expect(() => parseEmailDeliveryCommand(args)).toThrow();
  expect(() => parseEmailDeliveryCommand([...args, "--confirm-project", "another-project"])).toThrow();
  expect(parseEmailDeliveryCommand([...args, "--confirm-project", "erasogmsqpgiirovubjh"])).toMatchObject({ apply: true });
  expect(() => parseEmailDeliveryCommand(["retry", "--id", id])).toThrow();
  expect(() => parseEmailDeliveryCommand(["inspect", "--recipient", "someone@example.test"])).toThrow();
});
it("accepts marketing status only as a read-only command without delivery or retry options", () => {
  expect(parseEmailDeliveryCommand(["marketing-status"])).toMatchObject({ command: "marketing-status", apply: false, id: null });
  for (const options of [["--id", id], ["--apply"], ["--expected-updated-at", "2026-09-28T00:00:00Z"],
    ["--confirm-project", "erasogmsqpgiirovubjh"], ["retry"], ["--limit", "100"]]) {
    expect(() => parseEmailDeliveryCommand(["marketing-status", ...options])).toThrow();
  }
});
it("reads marketing status in the approved restricted environment without Resend credentials", async () => {
  await expect(runEmailDeliveryCommand(["marketing-status"], env)).resolves.toMatchObject({
    project: "erasogmsqpgiirovubjh", action: "marketing_status", imports: [],
  });
  expect(mocks.rpc.mock.calls).toEqual([["read_marketing_operations", { p_limit: 20 }]]);
  expect(mocks.createClient).toHaveBeenCalledWith(env.NEXT_PUBLIC_SUPABASE_URL, "test-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});
it("rejects marketing status outside the approved project and restricted environment before connecting", async () => {
  for (const overrides of [{ HELIX_EMAIL_MODE: "live" }, { HELIX_EMAIL_ENVIRONMENT: "production" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://other-project.supabase.co" }, { SUPABASE_SERVICE_ROLE_KEY: "" }]) {
    await expect(runEmailDeliveryCommand(["marketing-status"], { ...env, ...overrides })).rejects.toThrow();
  }
  expect(mocks.createClient).not.toHaveBeenCalled();
});
it("fails closed on a malformed or unbounded marketing response without echoing provider errors", async () => {
  for (const response of [{ data: null, error: null }, { data: [], error: { message: "private@example.test" } },
    { data: { email: "private@example.test" }, error: null }, { data: Array(21).fill({}), error: null }]) {
    mocks.rpc.mockResolvedValueOnce(response);
    await expect(runEmailDeliveryCommand(["marketing-status"], env)).rejects.toThrow("Marketing inspection is unavailable.");
  }
});
it("projects only finite import diagnostics and adds bounded retry guidance", async () => {
  mocks.rpc.mockResolvedValue({ data: [{ ...operation, email: "private@example.test", token: "private-token",
    firstFailure: { ...operation.firstFailure, message: "private provider detail" } }], error: null });
  const result = await runEmailDeliveryCommand(["marketing-status"], env);
  expect(result).toEqual({ project: "erasogmsqpgiirovubjh", action: "marketing_status", imports: [{ ...operation,
    remediation: { code: "wait_for_scheduled_retry", action: "Wait for the worker to retry only while current consent and generation remain eligible." },
  }] });
  expect(JSON.stringify(result)).not.toMatch(/private@example|private-token|private provider/);
});
it("describes exhausted, uncertain, configuration, and terminal states without offering a replay action", async () => {
  const rows = [
    { ...operation, importState: "exhausted", attemptCount: 3, nextSubmissionAt: null },
    { ...operation, importState: "uncertain", firstFailure: null, nextSubmissionAt: null, currentGeneration: 3, currentConsentStatus: "withdrawn" },
    { ...operation, importState: "uncertain", nextSubmissionAt: null,
      firstFailure: { category: "configuration_rejected", httpStatus: 403, providerName: "invalid_permission", retryAfterSeconds: null } },
    { ...operation, importState: "submitted", providerImportId: id, nextSubmissionAt: null },
    { ...operation, importState: "failed", providerImportId: id, nextSubmissionAt: null },
    { ...operation, importState: "completed", providerImportId: id, nextSubmissionAt: null },
    { ...operation, importState: "admitted", firstFailure: null, nextSubmissionAt: null },
  ];
  mocks.rpc.mockResolvedValue({ data: rows, error: null });
  const result = await runEmailDeliveryCommand(["marketing-status"], env);
  expect(result.imports?.map((row) => row.remediation.code)).toEqual([
    "review_exhausted_rejections", "reconcile_uncertain_import", "review_configuration_and_reconcile",
    "await_import_result", "review_failed_import", "no_import_action", "reconcile_uncertain_import",
  ]);
});
it("rejects malformed identities, counters, states, dates, and diagnostic fields without leaking their values", async () => {
  for (const override of [
    { subscriberId: "private@example.test" }, { generation: 0 }, { currentGeneration: Number.MAX_SAFE_INTEGER + 1 },
    { attemptCount: 0 }, { attemptCount: 4 }, { importState: "private@example.test" }, { currentConsentStatus: "enabled" },
    { nextSubmissionAt: "private@example.test" }, { providerImportId: "private@example.test" }, { firstFailure: undefined },
    { firstFailure: { ...operation.firstFailure, category: "private@example.test" } },
    { firstFailure: { ...operation.firstFailure, providerName: "private@example.test" } },
    { firstFailure: { ...operation.firstFailure, httpStatus: 999 } },
    { firstFailure: { ...operation.firstFailure, retryAfterSeconds: 86_401 } },
  ]) {
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...operation, ...override }], error: null });
    await expect(runEmailDeliveryCommand(["marketing-status"], env)).rejects.toThrow("Marketing inspection is unavailable.");
  }
});
