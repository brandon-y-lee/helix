import { describe, expect, it, vi } from "vitest";
import { handleSupportAdminRequest, type SupportAdminDependencies } from "@/lib/support/admin-request";
import { SupportError } from "@/lib/support/request";

const id = "5728e722-cc81-43be-b446-0695c7dc3aef";
const origin = "https://helixskin.vercel.app";
function setup() {
  return { requireAccess: vi.fn().mockResolvedValue({ userId: "trusted-operator" }),
    list: vi.fn().mockResolvedValue({ inquiries: [], nextPage: null }),
    get: vi.fn().mockResolvedValue({ id, revision: 2 }),
    mutate: vi.fn().mockResolvedValue({ id, revision: 3 }),
  } satisfies SupportAdminDependencies;
}

describe("private support routes", () => {
  it("authorizes reads before loading any private data", async () => {
    const dependencies = setup();
    dependencies.requireAccess.mockRejectedValue(new SupportError("forbidden"));
    const response = await handleSupportAdminRequest(new Request(`${origin}/api/admin/support/${id}`), id, dependencies);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(dependencies.get).not.toHaveBeenCalled();
    expect(dependencies.list).not.toHaveBeenCalled();
  });

  it("uses the authenticated Operator for an exact draft approval and never accepts a browser actor", async () => {
    const dependencies = setup();
    const send = (body: unknown, suppliedOrigin = origin) => handleSupportAdminRequest(new Request(`${origin}/api/admin/support/${id}`, {
      method: "POST", headers: { origin: suppliedOrigin, "content-type": "application/json" }, body: JSON.stringify(body),
    }), id, dependencies);
    const approval = { action: "approve_reply", expectedRevision: 2, draftVersion: 1 };
    const response = await send(approval);
    expect(response.status).toBe(200);
    expect(dependencies.requireAccess).toHaveBeenLastCalledWith("support.reply");
    expect(dependencies.mutate).toHaveBeenCalledWith("trusted-operator", id, approval);
    dependencies.mutate.mockClear();
    expect((await send({ ...approval, actorId: "forged" })).status).toBe(400);
    expect((await send(approval, "https://evil.example")).status).toBe(403);
    expect(dependencies.mutate).not.toHaveBeenCalled();
  });

  it("preserves stale and uncertain reply states without an automatic second action", async () => {
    const dependencies = setup();
    dependencies.mutate.mockRejectedValue(new SupportError("reply_reconciliation_required"));
    const response = await handleSupportAdminRequest(new Request(`${origin}/api/admin/support/${id}`, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ action: "approve_reply", expectedRevision: 2, draftVersion: 1 }),
    }), id, dependencies);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "reply_reconciliation_required" } });
    expect(dependencies.mutate).toHaveBeenCalledOnce();
  });

  it("validates a bounded history cursor before reading a conversation", async () => {
    const dependencies = setup();
    const cursor = "870de323-e64a-456a-9a27-3b39d48dd659";
    const response = await handleSupportAdminRequest(new Request(`${origin}/api/admin/support/${id}?before=${cursor}`), id, dependencies);
    expect(response.status).toBe(200);
    expect(dependencies.get).toHaveBeenCalledWith("trusted-operator", id, cursor);
    dependencies.get.mockClear();
    expect((await handleSupportAdminRequest(new Request(`${origin}/api/admin/support/${id}?before=invalid`), id, dependencies)).status).toBe(400);
    expect(dependencies.get).not.toHaveBeenCalled();
  });

  it("stores internal notes through their own action and treats closure separately", async () => {
    const dependencies = setup();
    for (const mutation of [{ action: "add_note", expectedRevision: 2, body: "Private investigation notes" },
      { action: "set_status", expectedRevision: 3, status: "closed" }]) {
      const response = await handleSupportAdminRequest(new Request(`${origin}/api/admin/support/${id}`, {
        method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(mutation),
      }), id, dependencies);
      expect(response.status).toBe(200);
      expect(dependencies.mutate).toHaveBeenLastCalledWith("trusted-operator", id, mutation);
    }
  });
});
