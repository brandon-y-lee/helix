import Stripe from "stripe";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const processing = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stripe/webhook", () => ({ processStripeWebhookEvent: processing }));
import { POST } from "@/app/api/webhooks/stripe/route";

const secret = "whsec_route_test_only";
const body = JSON.stringify({ id: "evt_route_test", livemode: false, type: "checkout.session.completed",
  api_version: "2026-06-24.dahlia", data: { object: { id: "cs_test_route" } } });
function request(payload = body, signature?: string) {
  return new Request("https://helix.example/api/webhooks/stripe", { method: "POST", body: payload,
    headers: { "stripe-signature": signature ?? Stripe.webhooks.generateTestHeaderString({ payload, secret }) } });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHECKOUT_ENABLED", "false");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_route_only");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_1Tm9WRFEzyaKzdmq");
  processing.mockResolvedValue({ action: "processed", type: "checkout.session.completed" });
});
afterEach(() => vi.unstubAllEnvs());

it("settles signed events with admission disabled and returns private success", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(processing).toHaveBeenCalledOnce();
});
it("returns retryable failure without exposing private errors", async () => {
  processing.mockRejectedValue(new Error("customer@example.test sk_test_secret"));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toMatch(/customer|sk_test_secret/);
});
it("rejects a changed raw body before processing", async () => {
  const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  expect((await POST(request(`${body}\n`, signature))).status).toBe(400);
  expect(processing).not.toHaveBeenCalled();
});
it("bounds actual body bytes even without a content-length header", async () => {
  expect((await POST(request("x".repeat(1024 * 1024 + 1)))).status).toBe(413);
  expect(processing).not.toHaveBeenCalled();
});
