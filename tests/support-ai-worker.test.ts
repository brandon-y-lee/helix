// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readWorkerConfig, runOnce } from "../scripts/support-ai/worker.mjs";

const config = {
  url: "https://helix.example/api/internal/support-ai/worker",
  secret: "synthetic-worker-secret-that-is-long-enough",
  accountId: "synthetic-account",
};
const job = () => ({
  id: "11111111-1111-4111-8111-111111111111",
  leaseToken: "22222222-2222-4222-8222-222222222222",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
  context: { messages: [{ id: "message", body: "Where is my order?" }], facts: [{ id: "policy", text: "Tracking is not available." }] },
});
const draft = { body: "Tracking is not available. An operator needs to review your order.", references: ["policy"], needsHuman: true };

function transport(responses: unknown[]) {
  const requests: Record<string, unknown>[] = [];
  const fetch = vi.fn(async (_url: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    if (!init) throw new Error("Missing request");
    expect(init.redirect).toBe("error");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${config.secret}` });
    requests.push(JSON.parse(String(init.body)));
    return Response.json(responses.shift());
  });
  return { fetch, requests };
}

describe("private support drafting worker", () => {
  it("claims one job, returns only an unapproved draft, and never retries", async () => {
    const api = transport([{ job: job() }, { accepted: true }]);
    const generate = vi.fn(async () => draft);
    expect(await runOnce(config, { fetch: api.fetch, generate })).toBe("completed");
    expect(generate).toHaveBeenCalledOnce();
    expect(api.requests.map((request) => request.action)).toEqual(["claim", "complete"]);
    expect(api.requests[1]).toMatchObject({ result: draft, runtime: { version: "0.158.0", model: "gpt-6-sol", promptVersion: "1" } });
    expect(JSON.stringify(generate.mock.calls)).not.toContain(config.secret);
  });

  it("leaves manual work available when the queue is empty or the result is stale", async () => {
    const generate = vi.fn(async () => draft);
    expect(await runOnce(config, { ...transport([{ job: null }]), generate })).toBe("idle");
    expect(generate).not.toHaveBeenCalled();
    const api = transport([{ job: job() }, { accepted: false }]);
    expect(await runOnce(config, { fetch: api.fetch, generate })).toBe("discarded");
    expect(api.requests.map((request) => request.action)).toEqual(["claim", "complete"]);
  });

  it("records a quota stop without paid fallback or another generation attempt", async () => {
    const api = transport([{ job: job() }, { accepted: true }]);
    const generate = vi.fn(async () => { throw Object.assign(new Error("private provider detail"), { code: "quota_exceeded" }); });
    expect(await runOnce(config, { fetch: api.fetch, generate })).toBe("quota_exceeded");
    expect(api.requests[1]).toMatchObject({ action: "fail", errorCode: "quota_exceeded" });
    expect(JSON.stringify(api.requests)).not.toContain("private provider detail");
    expect(generate).toHaveBeenCalledOnce();
  });

  it("stops inference when the owner cancels and never completes the job", async () => {
    vi.useFakeTimers();
    try {
      const api = transport([{ job: job() }, { active: false }, { accepted: false }]);
      const generate = vi.fn((_context, options: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
      }));
      const pending = runOnce(config, { fetch: api.fetch, generate });
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await pending).toBe("cancelled");
      expect(api.requests.map((request) => request.action)).toEqual(["claim", "check", "fail"]);
    } finally { vi.useRealTimers(); }
  });

  it("rejects an expired lease before disclosing any context to the model", async () => {
    const expired = { ...job(), expiresAt: new Date(Date.now() - 1).toISOString() };
    const api = transport([{ job: expired }, { accepted: false }]);
    const generate = vi.fn();
    expect(await runOnce(config, { fetch: api.fetch, generate })).toBe("worker_timeout");
    expect(generate).not.toHaveBeenCalled();
  });

  it("treats an uncertain lease check as a stop, preserving manual replies", async () => {
    vi.useFakeTimers();
    try {
      const api = transport([{ job: job() }, { active: "unknown" }, { accepted: true }]);
      const generate = vi.fn((_context, options: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
      }));
      const pending = runOnce(config, { fetch: api.fetch, generate });
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await pending).toBe("invalid_result");
      expect(api.requests.map((request) => request.action)).toEqual(["claim", "check", "fail"]);
    } finally { vi.useRealTimers(); }
  });

  it("expires stalled inference at the bounded deadline", async () => {
    vi.useFakeTimers();
    try {
      const api = transport([{ job: { ...job(), expiresAt: new Date(Date.now() + 11_000).toISOString() } }, { accepted: true }]);
      const generate = vi.fn((_context, options: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
      }));
      const pending = runOnce(config, { fetch: api.fetch, generate });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await pending).toBe("worker_timeout");
      expect(api.requests[1]).toMatchObject({ action: "fail", errorCode: "worker_timeout" });
    } finally { vi.useRealTimers(); }
  });

  it("requires a private account binding and refuses insecure or redirected destinations", () => {
    const env = { HELIX_SUPPORT_AI_URL: "https://helix.example", HELIX_SUPPORT_AI_WORKER_SECRET: config.secret, HELIX_SUPPORT_AI_ACCOUNT_ID: config.accountId };
    expect(readWorkerConfig(env)).toEqual(config);
    expect(() => readWorkerConfig({ ...env, HELIX_SUPPORT_AI_ACCOUNT_ID: undefined })).toThrow();
    expect(() => readWorkerConfig({ ...env, HELIX_SUPPORT_AI_URL: "http://public.example" })).toThrow();
    expect(() => readWorkerConfig({ ...env, HELIX_SUPPORT_AI_URL: "https://helix.example/other" })).toThrow();
    expect(readWorkerConfig({ ...env, HELIX_SUPPORT_AI_URL: "http://host.docker.internal:3000" }).url).toBe("http://host.docker.internal:3000/api/internal/support-ai/worker");
  });
});
