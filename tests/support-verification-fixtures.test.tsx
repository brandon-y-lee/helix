import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SupportConversationVerificationPage from "@/app/helix-verification/admin/support/page";
import SupportIntakeVerificationPage from "@/app/helix-verification/admin/support/intake/page";
import { createSupportConversationRequest, supportInquiryFixture } from "@/app/helix-verification/admin/support/SupportConversationVerification";
import { createSupportIntakeRequest } from "@/app/helix-verification/admin/support/SupportIntakeVerification";
import { applicationRouteMode } from "@/lib/admin/routes";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
beforeEach(() => { vi.stubEnv("VERCEL", ""); vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "1"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const routes = [SupportConversationVerificationPage, SupportIntakeVerificationPage];
const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

describe("support verification isolation", () => {
  it.each(["", "0", "true"])("requires the exact local adapter flag instead of %s", async (flag) => {
    vi.stubEnv("HELIX_VERIFICATION_ADAPTER", flag);
    for (const route of routes) await expect(route({})).rejects.toThrow("NOT_FOUND");
  });

  it("blocks both fixture routes on hosted Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    for (const route of routes) await expect(route({})).rejects.toThrow("NOT_FOUND");
  });

  it.each([{ inquiryId: "private" }, { scenario: "unknown" }, { scenario: ["photos", "photos"] }])("rejects unsupported query selection %j", async (query) => {
    for (const route of routes) await expect(route({ searchParams: Promise.resolve(query) })).rejects.toThrow("NOT_FOUND");
  });

  it("omits live navigation and commerce chrome on the exact isolated paths", async () => {
    const page = await SupportConversationVerificationPage({});
    expect(page.props.navigationEnabled).toBe(false);
    expect(page.props.modules).toEqual([expect.objectContaining({ route: "/admin/support" })]);
    expect(applicationRouteMode("/helix-verification/admin/support")).toBe("standard-admin");
    expect(applicationRouteMode("/helix-verification/admin/support/intake")).toBe("standard-admin");
    expect(applicationRouteMode("/helix-verification/admin/support/unknown")).toBe("storefront");
  });

  it("keeps intake, direct upload retry, and status entirely inside its local adapter", async () => {
    const liveFetch = vi.fn(() => { throw new Error("Unexpected real fetch"); });
    vi.stubGlobal("fetch", liveFetch);
    const request = createSupportIntakeRequest("upload-retry");
    expect(await (await request("/api/support/intake")).json()).toEqual({ available: true, photosAvailable: true });
    await request("/api/support/intake", post({}));
    const admission = await (await request("/api/support/photos", post({ action: "admit", uploadId: "synthetic-upload" }))).json();
    await expect(request(admission.uploadUrl, { method: "PUT" })).rejects.toThrow("Synthetic upload response lost");
    await expect(request(admission.uploadUrl, { method: "PUT" })).resolves.toHaveProperty("status", 200);
    await request("/api/support/photos", post({ action: "complete", photoId: admission.photoId }));
    expect(await (await request("/api/support/photos", post({ action: "status" }))).json()).toMatchObject({
      ok: true, photos: [{ uploadId: "synthetic-upload", status: "ready" }],
    });
    await expect(request("https://api.resend.com/emails", post({}))).rejects.toThrow("Unsupported synthetic request");
    expect(liveFetch).not.toHaveBeenCalled();
  });

  it("provides local private image bytes without granting a real resource URL", async () => {
    const liveFetch = vi.fn(() => { throw new Error("Unexpected real fetch"); });
    vi.stubGlobal("fetch", liveFetch);
    const inquiry = supportInquiryFixture("photos");
    const request = createSupportConversationRequest("photos");
    const photo = inquiry.messages[0].photos![0];
    const path = `/api/admin/support/${inquiry.id}/photos/${photo.id}`;
    const grant = await (await request(path, post({}))).json();
    expect(grant.url).toBe(`${path}?capability=synthetic-unused-token`);
    const image = await request(grant.url);
    expect(image.headers.get("Content-Type")).toBe("image/webp");
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0);
    await expect(request(`${path}?capability=real-token`)).rejects.toThrow("Unsupported synthetic request");
    await expect(request("https://unsafe.example/tracker")).rejects.toThrow("Unsupported synthetic request");
    expect(liveFetch).not.toHaveBeenCalled();
  });

  it("isolates scenario state for each mounted conversation", async () => {
    const inquiry = supportInquiryFixture("new-context");
    const path = `/api/admin/support/${inquiry.id}`;
    const first = createSupportConversationRequest("new-context");
    const second = createSupportConversationRequest("new-context");
    expect((await first(path, post({ action: "approve_reply", expectedRevision: 2, draftVersion: 1 }))).status).toBe(409);
    expect(await (await first(path)).json()).toMatchObject({ inquiry: { revision: 3 } });
    expect(await (await second(path)).json()).toMatchObject({ inquiry: { revision: 2 } });
  });
});
