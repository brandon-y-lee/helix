import { describe, expect, it, vi } from "vitest";
import { parseSupportInboxQuery, supportInboxHref } from "@/lib/support/pagination";
import { handleSupportAdminRequest, type SupportAdminDependencies } from "@/lib/support/admin-request";

const cursor = { createdAt: "2026-09-28T12:00:00.123456Z", id: "5728e722-cc81-43be-b446-0695c7dc3aef" };
const origin = "https://helixskin.vercel.app";
function dependencies() {
  return { requireAccess: vi.fn().mockResolvedValue({ userId: "trusted-operator" }),
    list: vi.fn().mockResolvedValue({ inquiries: [], nextCursor: cursor, previousCursor: null }),
    get: vi.fn(), mutate: vi.fn() } satisfies SupportAdminDependencies;
}

describe("stable Inbox keyset navigation", () => {
  it("round trips exact microsecond cursor precision in both directions", () => {
    for (const direction of ["older", "newer"] as const) {
      const href = supportInboxHref("all", cursor, direction);
      const query = Object.fromEntries(new URL(href, origin).searchParams);
      expect(parseSupportInboxQuery(query)).toEqual({ status: "all", cursor, direction });
    }
  });

  it("carries a returned boundary through the endpoint without an offset ceiling or reset", async () => {
    const deps = dependencies();
    const first = await handleSupportAdminRequest(new Request(`${origin}/api/admin/support?status=closed`), undefined, deps);
    const next = (await first.json()).nextCursor;
    const url = new URL(supportInboxHref("closed", next), origin);
    url.pathname = "/api/admin/support";
    expect((await handleSupportAdminRequest(new Request(url), undefined, deps)).status).toBe(200);
    expect(deps.list).toHaveBeenLastCalledWith("trusted-operator", { status: "closed", cursor, direction: "older" });
  });

  it.each([
    { page: "1001" }, { before: "invalid" }, { before: "", after: "" },
    { before: `${cursor.createdAt},invalid` }, { before: `${cursor.createdAt},${cursor.id}`, after: `${cursor.createdAt},${cursor.id}` },
    { before: `2026-02-30T12:00:00.000000Z,${cursor.id}` }, { before: ["first", "second"] },
  ])("rejects malformed or ambiguous boundaries instead of opening the first page: %j", async (query) => {
    expect(() => parseSupportInboxQuery(query)).toThrow();
    const deps = dependencies();
    const url = new URL("/api/admin/support", origin);
    for (const [key, value] of Object.entries(query)) {
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, item);
    }
    expect((await handleSupportAdminRequest(new Request(url), undefined, deps)).status).toBe(400);
    expect(deps.list).not.toHaveBeenCalled();
  });
});
