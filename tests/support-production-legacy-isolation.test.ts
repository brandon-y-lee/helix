// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/support/inbound-storage", () => ({ inboundRpc: mocks.rpc }));
import { recordSupportReceivedEvent } from "@/lib/support/inbound-webhook";
const env = { HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted", HELIX_SUPPORT_RECEIVING_ADDRESS: "support@legacy.example.invalid" };
const alias = `reply-${"a".repeat(48)}@legacy.example.invalid`;
const event = { email_id: "00000000-0000-4000-8000-000000000001", from: "visitor@example.invalid", to: ["support@helixskin.us"] };
const record = (data: Record<string, unknown>) => recordSupportReceivedEvent("msg_synthetic", data, "2026-11-17T12:00:00Z", env);
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue(true); });
it("excludes native-only production mail without database calls or reading sender metadata", async () => {
  const data = { ...event, to: ["Support <SUPPORT@HELIXSKIN.US>"] };
  Object.defineProperty(data, "from", { get: () => { throw new Error("sender must not be read"); } });
  await record(data);
  await recordSupportReceivedEvent("msg_synthetic", data, "2026-11-17T12:00:00Z", {});
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("finds native production support in the entire To/CC/BCC/received_for set, not only its first address", async () => {
  for (const field of ["to", "cc", "bcc", "received_for"]) {
    mocks.rpc.mockClear(); mocks.rpc.mockResolvedValue(false);
    await record({ ...event, to: [alias], [field]: [alias, "support@helixskin.us"] });
    expect(mocks.rpc).not.toHaveBeenCalledWith("record_support_inbound", expect.anything());
    expect(mocks.rpc).toHaveBeenCalledWith("support_legacy_reply_aliases_match", { p_address_hashes: [createHash("sha256").update(alias).digest("hex")] }, expect.any(AbortSignal));
  }
});
it("permits the narrow exact positively stored alias exception and passes no sender/content to its resolver", async () => {
  await record({ ...event, cc: [alias] });
  expect(mocks.rpc.mock.calls[0][0]).toBe("support_legacy_reply_aliases_match");
  expect(JSON.stringify(mocks.rpc.mock.calls[0][1])).not.toContain("visitor");
  expect(JSON.stringify(mocks.rpc.mock.calls[0][1])).not.toContain(alias);
  expect(mocks.rpc.mock.calls[1][0]).toBe("record_support_inbound");
});
it("excludes definitive unknown recipients but retries unavailable or malformed resolver results without persistence", async () => {
  mocks.rpc.mockResolvedValue(false);
  await record({ ...event, cc: [alias, "unknown@example.invalid"] });
  expect(mocks.rpc).not.toHaveBeenCalledWith("record_support_inbound", expect.anything());
  for (const resolve of [() => Promise.resolve("true"), () => Promise.resolve(undefined), () => Promise.reject(new Error("private diagnostic"))]) {
    mocks.rpc.mockClear(); mocks.rpc.mockImplementation(resolve);
    await expect(record({ ...event, cc: [alias] })).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalledWith("record_support_inbound", expect.anything());
  }
  for (const changed of [{ cc: "support@helixskin.us" }, { cc: null }, { bcc: [null] }, { received_for: ["bad\r\naddress"] },
    { to: Array(101).fill(alias) }]) {
    mocks.rpc.mockClear(); await expect(record({ ...event, ...changed })).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  }
});
it("bounds a stalled resolver and never persists after timeout", async () => {
  vi.useFakeTimers();
  try {
    mocks.rpc.mockImplementation(() => new Promise(() => undefined));
    const pending = record({ ...event, cc: [alias] });
    const proof = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(2_001);
    await proof;
    expect(mocks.rpc).not.toHaveBeenCalledWith("record_support_inbound", expect.anything());
  } finally { vi.useRealTimers(); }
});
it("leaves pure legacy base/alias quarantine and acknowledgement/reply controls unchanged", async () => {
  await record({ ...event, to: ["support@legacy.example.invalid", alias, "unknown@example.invalid"] });
  expect(mocks.rpc).toHaveBeenCalledOnce();
  expect(mocks.rpc).toHaveBeenCalledWith("record_support_inbound", expect.objectContaining({ p_sender: event.from,
    p_recipients: ["support@legacy.example.invalid", alias, "unknown@example.invalid"] }));
});
