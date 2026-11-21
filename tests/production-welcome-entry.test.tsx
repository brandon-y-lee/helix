// @vitest-environment-options {"url":"https://www.helixskin.us/email-preferences"}
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { FooterSignup } from "@/components/marketing/FooterSignup";
import { EmailPreferences } from "@/components/marketing/EmailPreferences";
import { PRODUCTION_MARKETING_WORDING } from "@/lib/production-marketing/contract";
import { readSignupScope } from "@/components/marketing/signup-readiness";

const subscription = "/api/marketing/production/subscription";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([{ enabled: true, production: true }, { enabled: false, production: false }, { enabled: false }])(
  "rejects an unqualified immutable inspection response %j",
  async (state) => {
    const request = vi.fn(async () => Response.json(state));
    vi.stubGlobal("fetch", request);
    expect(await readSignupScope("immutable", new AbortController().signal)).toBeNull();
    expect(request).toHaveBeenCalledWith(subscription, expect.objectContaining({ cache: "no-store" }));
  },
);

it.each([FooterSignup, EmailPreferences])(
  "shows only welcome consent before and after canonical readiness",
  async (Entry) => {
    const request = vi.fn(async () => Response.json({ ready: true, scope: "lifecycle_reviews" }));
    vi.stubGlobal("fetch", request);
    expect(renderToString(<Entry />)).not.toMatch(
      /welcome offers|cart and product reminders|skincare education/i,
    );
    render(<Entry />);
    await screen.findByText(/signup is paused/i);
    expect(request.mock.calls).toHaveLength(1);
    expect(request).toHaveBeenCalledWith(subscription, expect.objectContaining({ cache: "no-store" }));
    expect(screen.getByRole("checkbox")).toBeDisabled();
  },
);

it("preserves a legacy confirmation link without looking up welcome readiness", async () => {
  const request = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", request);
  render(<EmailPreferences confirmToken="issued-token" lifecycle />);
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm subscription" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request).toHaveBeenCalledWith(
    "/api/marketing/confirm",
    expect.objectContaining({ body: JSON.stringify({ token: "issued-token", scope: "lifecycle" }) }),
  );
});

it.each([FooterSignup, EmailPreferences])(
  "submits canonical consent once with no legacy fields",
  async (Entry) => {
    const request = vi.fn(async (_url: string, init: RequestInit) =>
      Response.json(init.method === "POST" ? { ok: true } : { enabled: true, production: true }),
    );
    vi.stubGlobal("fetch", request);
    render(<Entry />);
    const box = screen.getByRole("checkbox");
    await waitFor(() => expect(box).toBeEnabled());
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleName(expect.stringContaining(PRODUCTION_MARKETING_WORDING));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "person@example.invalid" } });
    const form = box.closest("form")!;
    fireEvent.submit(form);
    expect(request).toHaveBeenCalledTimes(1);
    fireEvent.click(box);
    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByText(/if this address is eligible/i);
    expect(request.mock.calls.map(([url]) => url)).toEqual([subscription, subscription]);
    expect(JSON.parse(request.mock.calls[1][1].body as string)).toEqual({
      email: "person@example.invalid",
      consent: true,
    });
  },
);
