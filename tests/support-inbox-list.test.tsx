import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupportInbox } from "@/components/admin/support/SupportInbox";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  inquiries: vi.fn(),
}));

vi.mock("@/lib/admin/capabilities", () => ({
  requireAdminCapability: mocks.authorize,
}));
vi.mock("@/lib/support/service", () => ({
  listSupportInquiriesForActor: mocks.inquiries,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ userId: "trusted-operator", capabilities: ["support.read"] });
  mocks.inquiries.mockResolvedValue({ inquiries: [], nextPage: null });
});

describe("Support Inbox list", () => {
  it("shows escaped inquiry details, delivery state, filters, and bounded page links", () => {
    const { container } = render(
      <SupportInbox
        status="open"
        page={1}
        nextPage={2}
        inquiries={[
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            revision: 2,
            status: "open",
            inquiryType: "product",
            name: "Alex",
            email: "alex@example.com",
            subject: "<img src=x onerror=alert(1)> Product question",
            createdAt: "2026-09-28T12:00:00.000Z",
            updatedAt: "2026-09-29T13:00:00.000Z",
            lastDeliveryState: "accepted",
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Support Inbox", level: 1 })).toBeVisible();
    const inquiry = screen.getByRole("link", {
      name: "<img src=x onerror=alert(1)> Product question",
    });
    expect(inquiry).toHaveAttribute("href", "/admin/support/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(container.querySelector("img")).toBeNull();
    const row = inquiry.closest("li")!;
    expect(within(row).getByText("Alex")).toBeVisible();
    expect(within(row).getByText("alex@example.com")).toBeVisible();
    expect(within(row).getByText("Product question")).toBeVisible();
    expect(within(row).getByText("Email accepted; delivery unconfirmed")).toBeVisible();
    expect(row.querySelectorAll("time")).toHaveLength(2);

    const filters = screen.getByRole("navigation", { name: "Filter inquiries" });
    expect(within(filters).getByRole("link", { name: "Open" })).toHaveAttribute("aria-current", "page");
    expect(within(filters).getByRole("link", { name: "Closed" })).toHaveAttribute("href", "/admin/support?status=closed");
    expect(within(filters).getByRole("link", { name: "All" })).toHaveAttribute("href", "/admin/support?status=all");
    expect(screen.getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/admin/support?status=open&page=0");
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/admin/support?status=open&page=2");
    expect(screen.getByText("Page 2")).toBeVisible();
  });

  it("keeps inquiries private when support permission cannot be verified", async () => {
    const { default: SupportInboxPage } = await import("@/app/admin/support/page");
    mocks.authorize.mockRejectedValue(new Error("private authorization diagnostic"));

    render(await SupportInboxPage({ searchParams: Promise.resolve({}) }));

    expect(mocks.authorize).toHaveBeenCalledWith("support.read");
    expect(mocks.inquiries).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Support Inbox unavailable");
    expect(screen.queryByText("private authorization diagnostic")).toBeNull();
  });

  it.each(["unknown_state", "constructor", "__proto__"])("shows a truthful fallback for an unfamiliar %s delivery state", (state) => {
    render(
      <SupportInbox
        status="closed"
        page={0}
        nextPage={null}
        inquiries={[{
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          revision: 1,
          status: "closed",
          inquiryType: "general",
          name: "Alex",
          email: "alex@example.com",
          subject: "General help",
          createdAt: "2026-09-28T12:00:00.000Z",
          updatedAt: "2026-09-29T13:00:00.000Z",
          lastDeliveryState: state,
        }]}
      />,
    );
    expect(screen.getByText("Email delivery status unavailable")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Previous page" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Next page" })).toBeNull();
  });

  it.each([
    [{ status: "closed", page: "2" }, "closed", 2],
    [{ status: "all", page: "1000" }, "all", 1000],
    [{ status: "open", page: "0" }, "open", 0],
    [{ status: "unknown", page: "1001" }, "open", 0],
    [{ status: ["closed", "all"], page: ["1", "2"] }, "open", 0],
    [{ status: "all", page: "1e2" }, "all", 0],
    [{ status: "all", page: "-1" }, "all", 0],
    [{}, "open", 0],
  ] satisfies [Record<string, string | string[]>, "open" | "closed" | "all", number][])("loads only the bounded filter and page for %j", async (query, status, page) => {
    const { default: SupportInboxPage } = await import("@/app/admin/support/page");
    render(await SupportInboxPage({ searchParams: Promise.resolve({ ...query }) }));

    expect(mocks.inquiries).toHaveBeenCalledWith("trusted-operator", { status, page });
    expect(screen.getByText(`Page ${page + 1}`)).toBeVisible();
    expect(screen.getByText(`No ${status === "all" ? "" : `${status} `}inquiries on this page.`)).toBeVisible();
  });
});
