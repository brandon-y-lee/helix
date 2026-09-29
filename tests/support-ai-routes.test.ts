import { describe, expect, it, vi } from "vitest";
import { handleSupportAiRequest, type SupportAiDependencies } from "@/lib/support/ai";
import { handleSupportAiWorkerRequest } from "@/lib/support/ai-worker";

const owner = "00000000-0000-4000-8000-000000000001";
const inquiry = "00000000-0000-4000-8000-000000000002";
const requestId = "00000000-0000-4000-8000-000000000003";
const origin = "https://helixskin.vercel.app";
const env = { HELIX_SUPPORT_AI_ENABLED: "true", HELIX_SUPPORT_AI_OWNER_ID: owner,
  HELIX_SUPPORT_AI_WORKER_SECRET: "s".repeat(32), HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted" };
function setup() {
  return { env, requireAccess: vi.fn().mockResolvedValue({ userId: owner }),
    rpc: vi.fn().mockResolvedValue({ job: null }) } satisfies SupportAiDependencies;
}
function request(body: unknown, suppliedOrigin = origin) {
  return new Request(`${origin}/api/admin/support/${inquiry}/ai-draft`, { method: "POST",
    headers: { origin: suppliedOrigin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
const payload = { action: "request", requestId, expectedRevision: 1, expectedDraftVersion: 0 };

describe("owner-requested support drafts", () => {
  it("admits only the qualified owner and server-owned context through same-origin requests", async () => {
    const deps = setup();
    const response = await handleSupportAiRequest(request(payload), inquiry, deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(deps.requireAccess).toHaveBeenCalledWith("support.reply");
    expect(deps.rpc).toHaveBeenCalledWith("request_support_ai_draft", expect.objectContaining({
      p_actor_id: owner, p_owner_id: owner, p_inquiry_id: inquiry, p_request_id: requestId,
      p_expected_revision: 1, p_expected_draft_version: 0,
    }));
    deps.rpc.mockClear();
    expect((await handleSupportAiRequest(request({ ...payload, context: "injected facts" }), inquiry, deps)).status).toBe(400);
    expect((await handleSupportAiRequest(request(payload, "https://evil.example"), inquiry, deps)).status).toBe(403);
    deps.requireAccess.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000004" });
    expect((await handleSupportAiRequest(request(payload), inquiry, deps)).status).toBe(403);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it("keeps manual service available when drafting is disabled and preserves recoverable job failures", async () => {
    const deps = setup();
    const disabled = { ...deps, env: { ...env, HELIX_SUPPORT_AI_ENABLED: "false" } };
    const read = await handleSupportAiRequest(new Request(`${origin}/api/admin/support/${inquiry}/ai-draft`), inquiry, disabled);
    expect(await read.json()).toEqual({ available: false, job: null });
    expect((await handleSupportAiRequest(request(payload), inquiry, disabled)).status).toBe(503);
    expect(deps.rpc).not.toHaveBeenCalled();
    deps.rpc.mockResolvedValue({ job: { id: requestId, state: "failed", errorCode: "authentication_required" } });
    expect(await (await handleSupportAiRequest(new Request(`${origin}/api/admin/support/${inquiry}/ai-draft`), inquiry, deps)).json())
      .toMatchObject({ available: true, job: { state: "failed", errorCode: "authentication_required" } });
  });
});

describe("scoped support drafting worker", () => {
  function worker(body: unknown, token = env.HELIX_SUPPORT_AI_WORKER_SECRET) {
    return new Request(`${origin}/api/internal/support-ai/worker`, { method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  it("requires the dedicated secret before loading private input and exposes no mutation action beyond a draft job", async () => {
    const deps = setup();
    expect((await handleSupportAiWorkerRequest(worker({ action: "claim" }, "wrong"), deps)).status).toBe(401);
    expect(deps.rpc).not.toHaveBeenCalled();
    expect((await handleSupportAiWorkerRequest(worker({ action: "approve_reply", jobId: requestId }), deps)).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
    deps.rpc.mockResolvedValue(null);
    const claimed = await handleSupportAiWorkerRequest(worker({ action: "claim" }), deps);
    expect(await claimed.json()).toEqual({ job: null });
    expect(claimed.headers.get("cache-control")).toBe("private, no-store");
    expect(deps.rpc).toHaveBeenCalledWith("claim_support_ai_draft", { p_owner_id: owner, p_lease_token: expect.any(String) });
  });

  it("accepts only pinned bounded output and leaves late-result decisions to the transactional job guard", async () => {
    const deps = setup();
    deps.rpc.mockResolvedValue(false);
    const completed = { action: "complete", jobId: requestId, leaseToken: inquiry,
      result: { body: "This demo creates no real shipment.", references: ["faq:checkout-availability"], needsHuman: false },
      runtime: { version: "0.158.0", model: "gpt-6-sol", promptVersion: "1" } };
    expect(await (await handleSupportAiWorkerRequest(worker(completed), deps)).json()).toEqual({ accepted: false });
    expect(deps.rpc).toHaveBeenCalledWith("finish_support_ai_draft", { p_owner_id: owner, p_job_id: requestId,
      p_lease_token: inquiry, p_body: completed.result.body, p_references: completed.result.references,
      p_needs_human: false, p_runtime: completed.runtime });
    deps.rpc.mockClear();
    for (const invalid of [
      { ...completed, runtime: { ...completed.runtime, model: "another-model" } },
      { ...completed, result: { ...completed.result, body: "x".repeat(4001) } },
      { ...completed, result: { ...completed.result, references: ["https://unsafe.example/private"] } },
      { ...completed, result: { ...completed.result, attachments: ["private-photo"] } },
      { action: "fail", jobId: requestId, leaseToken: inquiry, errorCode: "raw provider details" },
    ]) expect((await handleSupportAiWorkerRequest(worker(invalid), deps)).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
    const disabled = { ...deps, env: { ...env, HELIX_SUPPORT_AI_ENABLED: "false" } };
    expect(await (await handleSupportAiWorkerRequest(worker({ action: "check", jobId: requestId, leaseToken: inquiry }), disabled)).json())
      .toEqual({ active: false });
    expect(await (await handleSupportAiWorkerRequest(worker(completed), disabled)).json()).toEqual({ accepted: false });
    expect(deps.rpc).not.toHaveBeenCalled();
  });
});
