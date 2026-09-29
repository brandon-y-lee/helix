import { expect, it, vi } from "vitest";
import { handleInboundReview } from "@/lib/support/inbound-review";
import { SupportError } from "@/lib/support/request";
const inquiry = "512913f0-efbc-49a9-9038-73cf6bca3cc8", inbound = "333913f0-efbc-49a9-9038-73cf6bca3cc8";
const origin = "https://helixskin.vercel.app";
function request(extra = {}, from = origin) {
  return new Request(`${origin}/api/admin/support/${inquiry}/inbound`, { method: "POST", headers: { origin: from, "content-type": "application/json" },
    body: JSON.stringify({ inboundId: inbound, expectedRevision: 4, action: "dismiss", ...extra }) });
}
it("authorizes quarantine review and binds the exact Inquiry revision to the authenticated actor", async () => {
  const dependencies = { requireAccess: vi.fn().mockResolvedValue({ userId: "operator" }), review: vi.fn().mockResolvedValue({ id: inquiry, revision: 5 }) };
  const response = await handleInboundReview(request(), inquiry, dependencies);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(dependencies.requireAccess).toHaveBeenCalledWith("support.reply");
  expect(dependencies.review).toHaveBeenCalledWith("operator", inquiry, inbound, 4, "dismiss");
});
it("rejects wrong-role, cross-origin and forged-actor review without touching private messages", async () => {
  const dependencies = { requireAccess: vi.fn().mockRejectedValue(new SupportError("forbidden")), review: vi.fn() };
  expect((await handleInboundReview(request(), inquiry, dependencies)).status).toBe(403);
  dependencies.requireAccess.mockResolvedValue({ userId: "operator" });
  expect((await handleInboundReview(request({}, "https://outside.example"), inquiry, dependencies)).status).toBe(403);
  expect((await handleInboundReview(request({ actorId: "forged" }), inquiry, dependencies)).status).toBe(400);
  expect(dependencies.review).not.toHaveBeenCalled();
});
