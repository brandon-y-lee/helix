import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoOrderVerificationPage from "@/app/helix-verification/admin/demo-orders/page";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
beforeEach(() => { vi.stubEnv("VERCEL", ""); vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "1"); });
afterEach(() => vi.unstubAllEnvs());

describe("isolated demo-order presentation route", () => {
  it.each(["", "0", "true"])("denies access with adapter flag %s", async (flag) => {
    vi.stubEnv("HELIX_VERIFICATION_ADAPTER", flag);
    await expect(DemoOrderVerificationPage({})).rejects.toThrow("NOT_FOUND");
  });

  it("denies access on hosted Vercel even with the adapter flag", async () => {
    vi.stubEnv("VERCEL", "1");
    await expect(DemoOrderVerificationPage({})).rejects.toThrow("NOT_FOUND");
  });

  it("rejects query parameters that could be mistaken for real Order selection", async () => {
    await expect(DemoOrderVerificationPage({ searchParams: Promise.resolve({ orderNumber: "HX-PRIVATE" }) }))
      .rejects.toThrow("NOT_FOUND");
  });

  it("rejects unknown or repeated fixture scenarios", async () => {
    await expect(DemoOrderVerificationPage({ searchParams: Promise.resolve({ scenario: "live-order" }) }))
      .rejects.toThrow("NOT_FOUND");
    await expect(DemoOrderVerificationPage({ searchParams: Promise.resolve({ scenario: ["default", "uncertain"] }) }))
      .rejects.toThrow("NOT_FOUND");
  });

  it.each(["default", "uncertain", "conflict", "lookup-error"])("allows the inert %s presentation scenario", async (scenario) => {
    await expect(DemoOrderVerificationPage({ searchParams: Promise.resolve({ scenario }) })).resolves.toBeTruthy();
  });

  it("renders the synthetic shell only for local verification", async () => {
    const page = await DemoOrderVerificationPage({});
    expect(page.props.viewPath).toBe("/admin/demo-orders");
    expect(page.props.navigationEnabled).toBe(false);
    expect(page.props.modules).toEqual([expect.objectContaining({ route: "/admin/demo-orders" })]);
  });
});
