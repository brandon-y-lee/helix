import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import MarketingConsentPage, { metadata } from "@/app/marketing/consent/page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const token = "T".repeat(43);
const page = (query: Record<string, string | string[]>) =>
  MarketingConsentPage({ searchParams: Promise.resolve(query) });

it.each([
  {}, { confirm: "invalid" }, { confirm: token, unsubscribe: token },
  { confirm: [token, token] }, { confirm: token, scope: ["lifecycle", "lifecycle_reviews"] },
])("serves no generic form or ambiguous action for %j", async (query) => {
  await expect(page(query as Record<string, string | string[]>)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
});

it("shows the exact review consent and waits for an explicit confirmation", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  render(await page({ confirm: token, scope: "lifecycle_reviews" }));
  expect(metadata).toMatchObject({ robots: { index: false, follow: false }, referrer: "no-referrer" });
  expect(screen.getByText(/post-purchase follow-ups, review invitations and next-purchase offers/)).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm subscription" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
  expect(screen.getByRole("status")).toHaveTextContent("Existing email opt-outs still apply");
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/marketing/confirm", expect.objectContaining({
    method: "POST", credentials: "same-origin", referrerPolicy: "no-referrer",
    body: JSON.stringify({ token, scope: "lifecycle_reviews" }),
  }));
});

it("lets an independent token holder withdraw lifecycle emails and then all marketing", async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
  vi.stubGlobal("fetch", fetch);
  render(await page({ unsubscribe: token, scope: "lifecycle" }));
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Stop lifecycle emails" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Lifecycle emails have been stopped"));
  fireEvent.click(screen.getByRole("button", { name: "Unsubscribe from marketing" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("You have unsubscribed from marketing emails"));
  expect(fetch.mock.calls.map(([route, options]) => [route, JSON.parse(options.body)])).toEqual([
    ["/api/marketing/preferences", { token, scope: "welcome" }],
    ["/api/marketing/preferences", { token, scope: "all" }],
  ]);
});

it("reports an expired token without exposing it or displaying a recovery form", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false }, { status: 400 })));
  render(await page({ confirm: token, scope: "lifecycle" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm subscription" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("invalid or has expired");
  expect(screen.queryByRole("textbox")).toBeNull();
});
