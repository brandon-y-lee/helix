import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { FooterSignup } from "@/components/marketing/FooterSignup";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps the form inert until it can submit the expected JSON", () => {
  const page = new DOMParser().parseFromString(renderToString(<FooterSignup />), "text/html");
  expect(page.querySelector("input")?.disabled).toBe(true);
  expect(page.querySelector("button")?.disabled).toBe(true);
});

it("submits only the address once and announces success after capture", async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal("fetch", fetch);
  render(<FooterSignup />);

  const form = screen.getByRole("form", { name: "Newsletter signup" });
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.submit(form);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "footer@example.invalid" } });
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/marketing/newsletter", expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ email: "footer@example.invalid" }),
    referrerPolicy: "no-referrer",
  }));
  await act(async () => resolve(Response.json({ ok: true })));
  expect(screen.getByRole("status")).toHaveTextContent("You’re signed up.");
  expect(screen.getByRole("status")).toHaveFocus();
});

it("keeps the address after a failed signup and aborts on unmount", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: false }))
    .mockResolvedValueOnce(Response.json({ ok: false }, { status: 429 }))
    .mockImplementation((_url: string, { signal }: RequestInit) =>
      new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason))));
  vi.stubGlobal("fetch", fetch);
  const view = render(<FooterSignup />);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "footer@example.invalid" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t sign you up.");
  expect(input).toHaveValue("footer@example.invalid");
  fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Please wait a few minutes");
  fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
  const signal = fetch.mock.calls[2][1].signal;
  await act(async () => view.unmount());
  expect(signal.aborted).toBe(true);
});
