import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { GuestReviewPage } from "@/components/reviews/GuestReviewPage";
const purchase = {
  orderItemId: "00000000-0000-4000-8000-000000000001",
  productName: "Sample serum",
  productSlug: "sample",
  id: null,
  revision: null,
  status: null,
  environment: "sandbox",
  displayName: null,
  rating: null,
  title: null,
  body: null,
};
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});
describe("guest capability navigation", () => {
  it("strips fragment before transport and ignores delayed reads from older link", async () => {
    let resolveFirst!: (r: Response) => void;
    const transport = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(window.location.hash).toBe("");
        const token = JSON.parse(String(init?.body)).token;
        if (token === "a".repeat(43))
          return new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          });
        return Response.json(
          { error: "This review link is invalid or expired." },
          { status: 403 },
        );
      },
    ) as typeof fetch;
    window.history.replaceState(
      null,
      "",
      "/reviews/guest#token=" + "a".repeat(43),
    );
    render(<GuestReviewPage transport={transport} />);
    await waitFor(() => expect(transport).toHaveBeenCalledOnce());
    await act(async () => {
      window.history.replaceState(
        null,
        "",
        "/reviews/guest#token=" + "b".repeat(43),
      );
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await screen.findByText("This review link is invalid or expired.");
    await act(async () =>
      resolveFirst(Response.json({ ok: true, result: [purchase] })),
    );
    expect(
      screen.queryByRole("heading", { name: "Sample serum" }),
    ).not.toBeInTheDocument();
  });
  it("missing token never requests data and explains reopening the email", () => {
    const transport = vi.fn() as typeof fetch;
    render(<GuestReviewPage transport={transport} />);
    expect(
      screen.getByText(/Reopen the original review link from your email/),
    ).toBeInTheDocument();
    expect(transport).not.toHaveBeenCalled();
  });
});
