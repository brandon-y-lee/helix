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
  mocks.inquiries.mockResolvedValue({ inquiries: [], nextCursor: null, previousCursor: null });
});

describe("Support Inbox list", () => {
  it("shows escaped inquiry details, delivery state, and stable older/newer navigation", () => {
    const { container } = render(
      <SupportInbox
        status="open"
        hasCursor
        nextCursor={{ createdAt: "2026-09-28T12:00:00.123456+00:00", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }}
        previousCursor={{ createdAt: "2026-09-28T14:00:00.654321+00:00", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }}
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
    expect(screen.getByRole("link", { name: "Newer inquiries" })).toHaveAttribute("href", "/admin/support?status=open&after=2026-09-28T14%3A00%3A00.654321%2B00%3A00%2Cbbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(screen.getByRole("link", { name: "Older inquiries" })).toHaveAttribute("href", "/admin/support?status=open&before=2026-09-28T12%3A00%3A00.123456%2B00%3A00%2Caaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(screen.getByRole("link", { name: "Newest inquiries" })).toHaveAttribute("href", "/admin/support?status=open");
    expect(screen.queryByText(/^Page \d/)).not.toBeInTheDocument();
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
        hasCursor={false}
        nextCursor={null}
        previousCursor={null}
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
    expect(screen.queryByRole("link", { name: "Newer inquiries" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Older inquiries" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Newest inquiries" })).toBeNull();
  });

  it.each([
    [{ status: "closed" }, "closed", "older", undefined],
    [{}, "open", "older", undefined],
    [{ status: "all", before: "2026-09-28T12:00:00.123456+00:00,aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, "all", "older", { createdAt: "2026-09-28T12:00:00.123456+00:00", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
    [{ status: "closed", after: "2026-09-28T14:00:00.654321+00:00,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, "closed", "newer", { createdAt: "2026-09-28T14:00:00.654321+00:00", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }],
  ] as const)("loads the selected filter and exact cursor for %j", async (query, status, direction, cursor) => {
    const { default: SupportInboxPage } = await import("@/app/admin/support/page");
    render(await SupportInboxPage({ searchParams: Promise.resolve({ ...query }) }));

    expect(mocks.inquiries).toHaveBeenCalledWith("trusted-operator", { status, direction, cursor });
    expect(screen.queryByText(/^Page \d/)).not.toBeInTheDocument();
    expect(screen.getByText(`No ${status === "all" ? "" : `${status} `}inquiries in this view.`)).toBeVisible();
    if (cursor) expect(screen.getByRole("link", { name: "Newest inquiries" })).toHaveAttribute("href", `/admin/support?status=${status}`);
    else expect(screen.queryByRole("link", { name: "Newest inquiries" })).not.toBeInTheDocument();
  });

  it.each([
    { before: "not-a-cursor" },
    { after: "" },
    { before: ["one", "two"] },
    { before: "2026-09-28T12:00:00Z,aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", after: "2026-09-28T14:00:00Z,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    { page: "0" },
    { page: "1001" },
    { page: ["1", "2"] },
  ])("rejects ambiguous, invalid, or legacy navigation %j instead of silently loading newest", async (query) => {
    const { default: SupportInboxPage } = await import("@/app/admin/support/page");
    render(await SupportInboxPage({ searchParams: Promise.resolve({ status: "closed", ...query }) }));

    expect(mocks.inquiries).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Support Inbox unavailable");
    expect(screen.getByRole("link", { name: "Newest inquiries" })).toHaveAttribute("href", "/admin/support?status=closed");
  });
});
