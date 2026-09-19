import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ access: vi.fn(), operations: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/admin/capabilities", () => ({
  ADMIN_CAPABILITIES: { paymentsManage: "payments.manage" },
  checkAdminCapability: boundary.access,
}));
vi.mock("@/lib/admin/payments/service", () => ({ getPaymentOperations: boundary.operations }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));

import AdminPaymentsPage, { metadata } from "@/app/admin/payments/page";

describe("private payment operations page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    boundary.redirect.mockImplementation(() => { throw new Error("redirect"); });
  });
  afterEach(cleanup);

  it("denies direct payment access before reading operations", async () => {
    boundary.access.mockResolvedValue({ status: "forbidden" });
    render(await AdminPaymentsPage());
    expect(boundary.access).toHaveBeenCalledWith("payments.manage");
    expect(screen.getByRole("heading", { name: "Payment access denied" })).toBeVisible();
    expect(boundary.operations).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated direct visit to sign in with a safe return path", async () => {
    boundary.access.mockResolvedValue({ status: "unauthenticated" });
    await expect(AdminPaymentsPage()).rejects.toThrow("redirect");
    expect(boundary.redirect).toHaveBeenCalledWith("/account/sign-in?next=%2Fadmin%2Fpayments");
    expect(boundary.operations).not.toHaveBeenCalled();
  });

  it("keeps access closed when authorization is unavailable", async () => {
    boundary.access.mockResolvedValue({ status: "unavailable" });
    render(await AdminPaymentsPage());
    expect(screen.getByRole("alert")).toHaveTextContent("Payment access could not be verified");
    expect(boundary.operations).not.toHaveBeenCalled();
  });

  it("does not reveal storage failures after the independent page authorization", async () => {
    boundary.access.mockResolvedValue({ status: "allowed" });
    boundary.operations.mockRejectedValue(new Error("secret provider payload"));
    const { container } = render(await AdminPaymentsPage());
    expect(screen.getByRole("alert")).toHaveTextContent("Payment operations are temporarily unavailable");
    expect(container).not.toHaveTextContent("secret provider payload");
    expect(metadata).toMatchObject({ robots: { index: false, follow: false }, referrer: "no-referrer" });
  });
});
