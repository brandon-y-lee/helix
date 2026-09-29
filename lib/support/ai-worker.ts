import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { supportAiDefaults, supportAiOwner, type SupportAiDependencies } from "@/lib/support/ai";
import { readSupportJson, SupportError, supportFailure, supportResponse, supportText, supportUuid } from "@/lib/support/request";

const failureCodes = ["quota_exceeded", "authentication_required", "runtime_mismatch", "invalid_result", "worker_timeout", "worker_unavailable", "cancelled"];
const runtime = { version: "0.158.0", model: "gpt-6-sol", promptVersion: "1" };
type Dependencies = Pick<SupportAiDependencies, "env" | "rpc">;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupportError("invalid_support_input");
  return value as Record<string, unknown>;
}

/** This credential can claim or finish bounded drafts; it cannot call any support mutation. */
export async function handleSupportAiWorkerRequest(request: Request, deps: Dependencies = supportAiDefaults): Promise<Response> {
  try {
    const secret = deps.env.HELIX_SUPPORT_AI_WORKER_SECRET;
    if (!secret || !/^[^\s]{32,256}$/.test(secret)) throw new SupportError("ai_unavailable");
    const expected = Buffer.from(`Bearer ${secret}`), supplied = Buffer.from(request.headers.get("authorization") ?? "");
    if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) throw new SupportError("authentication_required");
    if (request.method !== "POST") throw new SupportError("invalid_support_input");
    const body = await readSupportJson(request);
    const ownerId = supportAiOwner(deps.env);
    if (body.action === "claim" && Object.keys(body).length === 1) {
      return supportResponse({ job: ownerId ? await deps.rpc("claim_support_ai_draft", { p_owner_id: ownerId, p_lease_token: randomUUID() }) : null });
    }
    const args = { p_owner_id: ownerId, p_job_id: supportUuid(body.jobId), p_lease_token: supportUuid(body.leaseToken) };
    if (body.action === "check" && Object.keys(body).length === 3) {
      return supportResponse({ active: ownerId ? (await deps.rpc("check_support_ai_draft", args)) === true : false });
    }
    if (body.action === "fail" && Object.keys(body).length === 4 && typeof body.errorCode === "string" && failureCodes.includes(body.errorCode)) {
      return supportResponse({ accepted: ownerId ? (await deps.rpc("finish_support_ai_draft", { ...args, p_error_code: body.errorCode })) === true : false });
    }
    if (body.action !== "complete" || Object.keys(body).length !== 5) throw new SupportError("invalid_support_input");
    const result = object(body.result), reportedRuntime = object(body.runtime);
    if (Object.keys(result).length !== 3 || typeof result.needsHuman !== "boolean"
      || !Array.isArray(result.references) || result.references.length > 8
      || result.references.some((ref) => typeof ref !== "string" || !/^faq:[a-z-]{1,64}$/.test(ref))
      || new Set(result.references).size !== result.references.length
      || Object.keys(reportedRuntime).length !== 3 || Object.entries(runtime).some(([key, value]) => reportedRuntime[key] !== value)) {
      throw new SupportError("invalid_support_input");
    }
    const text = supportText(result.body, 4000, true);
    return supportResponse({ accepted: ownerId ? (await deps.rpc("finish_support_ai_draft", { ...args,
      p_body: text, p_references: result.references, p_needs_human: result.needsHuman, p_runtime: runtime })) === true : false });
  } catch (error) { return supportFailure(error); }
}
