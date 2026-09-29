import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailPreferences } from "@/components/marketing/EmailPreferences";
import EmailPreferencesPage, { metadata } from "@/app/email-preferences/page";

describe("marketing subscription and preferences", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requires a separate unchecked marketing choice before requesting confirmation", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 202 }),
      );
    vi.stubGlobal("fetch", fetch);
    render(<EmailPreferences />);

    const consent = screen.getByRole("checkbox", {
      name: /I want to receive helix marketing emails/,
    });
    expect(consent).not.toBeChecked();
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/privacy");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "delivered@resend.dev",
    );
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(fetch).not.toHaveBeenCalled();

    await userEvent.click(consent);
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/marketing/subscription",
      expect.objectContaining({
        method: "POST",
        referrerPolicy: "no-referrer",
        body: JSON.stringify({ email: "delivered@resend.dev", consent: true }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If this address is eligible, check your inbox to confirm.",
    );
    await userEvent.clear(
      screen.getByRole("textbox", { name: "Email address" }),
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("does not confirm when opened and waits for an explicit confirmation click", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    render(<EmailPreferences confirmToken="synthetic-confirmation" />);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Confirm subscription" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/marketing/confirm",
      expect.objectContaining({
        method: "POST",
        referrerPolicy: "no-referrer",
        body: JSON.stringify({ token: "synthetic-confirmation" }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your subscription is confirmed. Existing email opt-outs still apply.",
    );
    expect(screen.getByRole("status")).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Confirm subscription" }),
    ).not.toBeInTheDocument();
  });

  it("offers independent welcome and all-marketing withdrawal without exposing a subscriber address", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ ok: true }))),
      );
    vi.stubGlobal("fetch", fetch);
    render(<EmailPreferences unsubscribeToken="synthetic-unsubscribe" />);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Order, account, and support emails are unaffected/),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Stop welcome emails" }),
    );
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/marketing/preferences",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          token: "synthetic-unsubscribe",
          scope: "welcome",
        }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Welcome emails have been stopped.",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Unsubscribe from marketing" }),
    );
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/marketing/preferences",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "synthetic-unsubscribe", scope: "all" }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "You have unsubscribed from marketing emails.",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("disables repeat submission while pending and retains the form after an unavailable response", async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<EmailPreferences />);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "delivered@resend.dev",
    );
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    const pending = screen.getByRole("button", { name: "Submitting…" });
    expect(pending).toBeDisabled();
    await userEvent.click(pending);
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => finish(new Response("Unavailable", { status: 503 })));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email preferences are temporarily unavailable. Please try again.",
    );
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveValue(
      "delivered@resend.dev",
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeEnabled();
  });

  it.each([
    [
      "invalid confirmation",
      { confirmToken: "private-confirmation" },
      "Confirm subscription",
      400,
      "invalid or has expired",
    ],
    [
      "unavailable withdrawal",
      { unsubscribeToken: "private-withdrawal" },
      "Unsubscribe from marketing",
      503,
      "temporarily unavailable",
    ],
  ] as const)(
    "shows a safe, retryable %s error",
    async (_name, props, button, status, message) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              ok: false,
              error:
                "Do not display private-confirmation or private-withdrawal",
            }),
            { status },
          ),
        );
      vi.stubGlobal("fetch", fetch);
      render(<EmailPreferences {...props} />);
      await userEvent.click(screen.getByRole("button", { name: button }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByRole("button", { name: button })).toBeEnabled();
      expect(document.body).not.toHaveTextContent(
        /private-confirmation|private-withdrawal/,
      );
    },
  );

  it.each(["network", "unexpected response"])(
    "does not report a successful subscription after a %s failure",
    async (failure) => {
      vi.stubGlobal(
        "fetch",
        failure === "network"
          ? vi
              .fn()
              .mockRejectedValue(
                new Error("Transport detail must stay private"),
              )
          : vi
              .fn()
              .mockResolvedValue(
                new Response("An unexpected page", { status: 200 }),
              ),
      );
      render(<EmailPreferences />);
      await userEvent.type(
        screen.getByRole("textbox", { name: "Email address" }),
        "delivered@resend.dev",
      );
      await userEvent.click(screen.getByRole("checkbox"));
      await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "temporarily unavailable",
      );
      expect(
        screen.queryByText(
          "If this address is eligible, check your inbox to confirm.",
        ),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Subscribe" })).toBeEnabled();
    },
  );

  it("keeps a token-bearing page private and performs no confirmation during page loading", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      await EmailPreferencesPage({
        searchParams: Promise.resolve({
          confirm: "synthetic-page-confirmation",
        }),
      }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Confirm subscription" }),
    ).toBeInTheDocument();
    expect(metadata).toMatchObject({
      robots: { index: false, follow: false },
      referrer: "no-referrer",
    });
  });

  it("does not carry a confirmed state into a different confirmation link", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    const { rerender } = render(
      await EmailPreferencesPage({
        searchParams: Promise.resolve({ confirm: "first-link" }),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm subscription" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your subscription is confirmed. Existing email opt-outs still apply.",
    );

    rerender(
      await EmailPreferencesPage({
        searchParams: Promise.resolve({ confirm: "second-link" }),
      }),
    );
    expect(
      screen.getByRole("button", { name: "Confirm subscription" }),
    ).toBeEnabled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("ignores an old withdrawal response after navigating to another link", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const { rerender } = render(
      await EmailPreferencesPage({
        searchParams: Promise.resolve({ unsubscribe: "first-link" }),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Unsubscribe from marketing" }),
    );
    rerender(
      await EmailPreferencesPage({
        searchParams: Promise.resolve({ unsubscribe: "second-link" }),
      }),
    );
    await act(async () => finish(new Response(JSON.stringify({ ok: true }))));
    expect(
      screen.getByRole("button", { name: "Unsubscribe from marketing" }),
    ).toBeEnabled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it.each([
    { confirm: ["first", "second"] },
    { confirm: "first", unsubscribe: "second" },
    { unsubscribe: "" },
  ])(
    "rejects ambiguous or empty email links without rendering token values",
    async (query) => {
      render(
        await EmailPreferencesPage({ searchParams: Promise.resolve(query) }),
      );
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This email link is invalid.",
      );
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(/first|second/);
    },
  );
});
