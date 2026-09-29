import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProductNotificationsPage, {
  dynamic,
  metadata,
} from "@/app/product-notifications/page";

describe("Product notification public page", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders an inert cancellation page without reading customer data", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const token = "a".repeat(43);
    render(
      await ProductNotificationsPage({
        searchParams: Promise.resolve({ cancel: token }),
      }),
    );
    expect(
      screen.getByRole("button", { name: "Cancel Product notification" }),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent(token);
    expect(dynamic).toBe("force-dynamic");
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
  });

  it.each([
    "",
    "a".repeat(42),
    "a".repeat(44),
    "/".repeat(43),
    ["a".repeat(43)],
    [],
  ])("rejects an invalid cancellation link: %j", async (cancel) => {
    render(
      await ProductNotificationsPage({
        searchParams: Promise.resolve({ cancel }),
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This cancellation link is invalid.",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request new cancellation links" }),
    ).toHaveAttribute("href", "/product-notifications");
  });

  it("offers recovery without requiring a Product URL", async () => {
    render(
      await ProductNotificationsPage({ searchParams: Promise.resolve({}) }),
    );
    expect(
      screen.getByRole("textbox", { name: "Email address" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Email cancellation links" }),
    ).toBeInTheDocument();
  });

  it("does not carry a pending cancellation result into another private link", async () => {
    let finish!: (value: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const view = render(
      await ProductNotificationsPage({
        searchParams: Promise.resolve({ cancel: "a".repeat(43) }),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel Product notification" }),
    );
    view.rerender(
      await ProductNotificationsPage({
        searchParams: Promise.resolve({ cancel: "b".repeat(43) }),
      }),
    );
    await act(async () => finish(new Response(JSON.stringify({ ok: true }))));
    expect(
      screen.getByRole("button", { name: "Cancel Product notification" }),
    ).toBeEnabled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
