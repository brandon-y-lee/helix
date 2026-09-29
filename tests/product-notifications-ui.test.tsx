import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductNotifications } from "@/components/waitlist/ProductNotifications";

describe("Product notification management", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests private cancellation links without revealing whether an address has requests", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 202 }),
      );
    vi.stubGlobal("fetch", fetch);
    render(<ProductNotifications />);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "delivered@resend.dev",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Email cancellation links" }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    const [path, init] = fetch.mock.calls[0];
    expect(path).toBe("/api/product-notifications/recovery");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    expect(JSON.parse(init.body)).toEqual({
      email: "delivered@resend.dev",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If this address is eligible, check your inbox for private cancellation links.",
    );
    expect(screen.getByRole("status")).toHaveFocus();
    expect(
      screen.queryByRole("link", { name: /cancel/i }),
    ).not.toBeInTheDocument();
  });

  it("does not cancel when opened and submits only after an explicit action", async () => {
    const token = "a".repeat(43);
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    render(<ProductNotifications cancelToken={token} />);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(token);
    expect(
      screen.getByText(/Your marketing preferences are unchanged/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel Product notification" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/product-notifications/cancel",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        body: JSON.stringify({ token }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your cancellation request has been processed.",
    );
    expect(screen.getByRole("status")).toHaveFocus();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.getByText(/A message already on its way may still arrive/),
    ).toBeInTheDocument();
  });

  it("keeps the same recovery identity after a lost response and starts a new request after success", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Response lost"))
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              privateUrl: "https://example.com/private",
              count: 17,
            }),
            { status: 202 },
          ),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    render(<ProductNotifications />);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "delivered@resend.dev",
    );
    const submit = screen.getByRole("button", {
      name: "Email cancellation links",
    });
    await userEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "temporarily unavailable",
    );
    await userEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If this address is eligible",
    );
    const first = JSON.parse(fetch.mock.calls[0][1].body);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual(first);
    expect(document.body).not.toHaveTextContent(/example.com\/private|17/);
    await userEvent.click(submit);
    const next = JSON.parse(fetch.mock.calls[2][1].body);
    expect(next.email).toBe(first.email);
    expect(next.requestId).not.toBe(first.requestId);
  });

  it("prevents repeated cancellation while pending and displays a safe retryable error", async () => {
    let finish!: (value: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const token = "a".repeat(43);
    render(<ProductNotifications cancelToken={token} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel Product notification" }),
    );
    const pending = screen.getByRole("button", { name: "Cancelling…" });
    expect(pending).toBeDisabled();
    await userEvent.click(pending);
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () =>
      finish(
        new Response(JSON.stringify({ ok: false, error: { message: token } }), {
          status: 400,
        }),
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This cancellation link is invalid or has expired. Request new links below.",
    );
    expect(document.body).not.toHaveTextContent(token);
    expect(
      screen.getByRole("button", { name: "Cancel Product notification" }),
    ).toBeEnabled();
  });

  it("does not claim cancellation after an unexpected response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("Unexpected response", { status: 200 }),
        ),
    );
    render(<ProductNotifications cancelToken={"a".repeat(43)} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel Product notification" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "temporarily unavailable",
    );
    expect(
      screen.getByRole("button", { name: "Cancel Product notification" }),
    ).toBeEnabled();
  });

  it("keeps recovery private and prevents repeated submission while a response is pending", async () => {
    let finish!: (value: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<ProductNotifications />);
    const email = screen.getByRole("textbox", { name: "Email address" });
    await userEvent.type(email, "delivered@resend.dev");
    await userEvent.click(
      screen.getByRole("button", { name: "Email cancellation links" }),
    );
    const pending = screen.getByRole("button", { name: "Requesting links…" });
    expect(pending).toBeDisabled();
    expect(email).toBeDisabled();
    await userEvent.click(pending);
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => finish(new Response("Unavailable", { status: 503 })));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "temporarily unavailable",
    );
    expect(email).toHaveValue("delivered@resend.dev");
    expect(
      screen.getByRole("button", { name: "Email cancellation links" }),
    ).toBeEnabled();
  });
});
