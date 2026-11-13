import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReviewModeration } from "@/components/reviews/ReviewModeration";
afterEach(() => vi.unstubAllGlobals());
it("offers neutral takedown of retained publication after latest edit rejection", async () => {
  const fetcher = vi.fn(async (_url: string, _options: RequestInit) =>
    Response.json({ ok: true }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <ReviewModeration
      initial={[
        {
          id: "00000000-0000-4000-8000-000000000001",
          revision: 3,
          environment: "live",
          status: "rejected",
          publishedRevision: 2,
          publishedTitle: "Old public title",
          publishedBody: "Old public text",
          productSlug: "serum",
          displayName: "Alex",
          rating: 1,
          title: "Rejected edit",
          body: "Latest edit text",
        },
      ]}
    />,
  );
  expect(screen.getByText("Old public text")).toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: "Approve latest revision" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Record decision" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toMatchObject({
    decision: "removed",
    expectedRevision: 3,
    reason: "spam",
  });
});
