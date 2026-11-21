// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.helixskin.us/contact"}
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContactForm } from "@/components/support/ContactForm";
const binding = {
  origin: "https://erasogmsqpgiirovubjh.supabase.co",
  bucket: "support-production-private",
};
const inquiryId = "00000000-0000-4000-8000-000000000001";
const available = () =>
  Response.json({
    available: true,
    photosAvailable: true,
    uploadBinding: binding,
  });
function fill() {
  for (const [label, value] of [
    [/^First and last name/, "Synthetic Visitor"],
    [/^Email/, "synthetic@example.invalid"],
    [/^Topic/, "Synthetic inquiry"],
    [/^Tell us the details/, "Synthetic message"],
  ] as const)
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Submit inquiry" }));
}
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
it("never falls back to legacy on canonical production when availability or binding is missing", async () => {
  for (const result of [
    { available: false },
    { available: true, photosAvailable: true },
    { available: true, photosAvailable: false, uploadBinding: binding },
  ]) {
    const request = vi.fn().mockResolvedValue(Response.json(result));
    const view = render(<ContactForm request={request} />);
    await waitFor(() =>
      expect(
        screen.queryByText("Checking support availability…"),
      ).not.toBeInTheDocument(),
    );
    expect(request.mock.calls[0][0]).toBe("/api/support/production/intake");
    expect(screen.queryByRole("button", { name: "Submit inquiry" })).toBeNull();
    view.unmount();
  }
});
it("sends zero photos and 64hex capability, validates saved receipt, and separates provider handoff", async () => {
  const bodies: Record<string, unknown>[] = [];
  const request = vi.fn(
    async (url: RequestInfo | URL, options?: RequestInit) => {
      if (!options?.method) return available();
      const body = JSON.parse(String(options.body));
      bodies.push(body);
      return String(url).endsWith("/intake")
        ? Response.json({
            ok: true,
            receipt: {
              inquiryId,
              submissionId: body.submissionId,
              status: "saved",
            },
          })
        : Response.json({
            ok: true,
            primaryHandoff: "provider_accepted",
            photos: [],
          });
    },
  );
  render(<ContactForm request={request} />);
  await screen.findByRole("button", { name: "Submit inquiry" });
  fill();
  submit();
  expect(
    await screen.findByRole("heading", { name: "Inquiry received" }),
  ).toHaveFocus();
  expect(bodies[0].photos).toEqual([]);
  expect(bodies[0].uploadCapability).toMatch(/^[a-f0-9]{64}$/);
  fireEvent.click(screen.getByRole("button", { name: "Check email handoff" }));
  expect(
    await screen.findByText(
      /Inbox delivery has not been independently confirmed/,
    ),
  ).toBeInTheDocument();
  expect(
    request.mock.calls.every((c) =>
      String(c[0]).startsWith("/api/support/production/"),
    ),
  ).toBe(true);
  expect(sessionStorage.getItem("helix.support.attempt.v1")).toBe("saved");
  expect(JSON.stringify(sessionStorage)).not.toContain("Synthetic");
});
it("retains the immutable uncertain retry, requires explicit changed-inquiry acknowledgement and warns on refresh", async () => {
  const posted: Record<string, unknown>[] = [];
  const request = vi.fn(
    async (_url: RequestInfo | URL, options?: RequestInit) => {
      if (!options?.method) return available();
      posted.push(JSON.parse(String(options.body)));
      throw new Error("lost");
    },
  );
  const view = render(<ContactForm request={request} />);
  await screen.findByRole("button", { name: "Submit inquiry" });
  fill();
  submit();
  await screen.findByText(/couldn’t confirm receipt/);
  submit();
  await waitFor(() => expect(posted).toHaveLength(2));
  expect(posted[1]).toEqual(posted[0]);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Submit inquiry" }),
    ).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText(/^Topic/), {
    target: { value: "Different topic" },
  });
  submit();
  expect(
    await screen.findByRole("button", {
      name: "Start a new inquiry with these changes",
    }),
  ).toBeInTheDocument();
  expect(posted).toHaveLength(2);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Start a new inquiry with these changes",
    }),
  );
  submit();
  await waitFor(() => expect(posted).toHaveLength(3));
  expect(posted[2].submissionId).not.toBe(posted[0].submissionId);
  view.unmount();
  render(<ContactForm request={request} />);
  expect(
    await screen.findByText(
      /An earlier inquiry in this tab may already be saved/,
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Submit inquiry" })).toBeDisabled();
  expect(posted).toHaveLength(3);
});
it("does not transmit selected photos until saved; validates exact path and retries lost PUT without changing identity", async () => {
  let puts = 0;
  let submission: Record<string, unknown> | undefined;
  let uploadId = "";
  const calls: { url: string; init?: RequestInit }[] = [];
  const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (!init?.method) return available();
    if (init.method === "PUT") {
      puts++;
      if (puts === 1) throw new Error("lost PUT");
      return Response.json({ error: "already exists" }, { status: 409 });
    }
    const body = JSON.parse(String(init.body));
    if (String(url).endsWith("/intake")) {
      submission = body;
      return Response.json({
        ok: true,
        receipt: {
          inquiryId,
          submissionId: body.submissionId,
          status: "saved",
        },
      });
    }
    if (body.action === "admit") {
      uploadId = body.uploadId;
      return Response.json({
        ok: true,
        uploadId,
        uploadUrl: `${binding.origin}/storage/v1/object/upload/sign/${binding.bucket}/raw/${inquiryId}/${uploadId}?token=synthetic`,
      });
    }
    if (body.action === "complete")
      return Response.json({ ok: true, status: "processing" });
    return Response.json({
      ok: true,
      primaryHandoff: "provider_accepted",
      photos: [{ uploadId, status: "ready", handoff: "unconfirmed" }],
    });
  });
  render(<ContactForm request={request} />);
  await screen.findByRole("button", { name: "Submit inquiry" });
  fill();
  fireEvent.change(screen.getByLabelText("Photos (optional)"), {
    target: {
      files: [new File(["synthetic"], "product.png", { type: "image/png" })],
    },
  });
  expect(calls).toHaveLength(1);
  submit();
  const retry = await screen.findByRole("button", {
    name: "Retry product.png",
  });
  fireEvent.click(retry);
  await screen.findByText("Processing — not yet available to support");
  expect(puts).toBe(2);
  const putCalls = calls.filter((c) => c.init?.method === "PUT");
  expect(putCalls[0].url).toBe(putCalls[1].url);
  expect(putCalls[1].init).toMatchObject({
    redirect: "error",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  expect(
    calls.filter((c) => c.url.endsWith("/intake") && c.init?.method === "POST"),
  ).toHaveLength(1);
  expect(submission?.photos).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Check photo status" }));
  expect(
    await screen.findByText(
      /Photo checked and saved privately; email handoff is not yet confirmed/,
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("Added privately for support")).toBeNull();
});
it("rejects a saved receipt for another submission and aborts the actual request on unmount", async () => {
  let signal: AbortSignal | undefined;
  const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (!init?.method) return available();
    signal = init.signal!;
    return Response.json({
      ok: true,
      receipt: { inquiryId, submissionId: inquiryId, status: "saved" },
    });
  });
  const view = render(<ContactForm request={request} />);
  await screen.findByRole("button", { name: "Submit inquiry" });
  fill();
  submit();
  await screen.findByText(/couldn’t confirm receipt/);
  expect(
    screen.queryByRole("heading", { name: "Inquiry received" }),
  ).toBeNull();
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
it("does not silently resume or submit after back-forward page restoration", async () => {
  const request = vi.fn().mockResolvedValue(available());
  render(<ContactForm request={request} />);
  await screen.findByRole("button", { name: "Submit inquiry" });
  fill();
  fireEvent(window, new Event("pagehide"));
  fireEvent(window, new Event("pageshow"));
  expect(
    await screen.findByRole("heading", {
      name: "This inquiry was interrupted",
    }),
  ).toHaveFocus();
  expect(
    screen.getByText(/Your message may already be saved. Uploads stopped/),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Submit inquiry" })).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
});

it("cannot replace uncertain attempt identity while its unchanged retry is in flight", async () => {
  const posted: Record<string, unknown>[] = [];
  let resolveRetry!: (value: Response) => void;
  const request = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
    if (!options?.method) return available();
    posted.push(JSON.parse(String(options.body)));
    if (posted.length === 1) throw new Error("lost receipt");
    return new Promise<Response>((resolve) => { resolveRetry = resolve; });
  });
  render(<ContactForm request={request} />);
  await screen.findByRole("button", { name: "Submit inquiry" });
  fill(); submit();
  await screen.findByText(/couldn’t confirm receipt/);
  fireEvent.change(screen.getByLabelText(/^Topic/), { target: { value: "Changed topic" } });
  submit();
  const change = await screen.findByRole("button", { name: "Start a new inquiry with these changes" });
  fireEvent.change(screen.getByLabelText(/^Topic/), { target: { value: "Synthetic inquiry" } });
  submit();
  await waitFor(() => expect(posted).toHaveLength(2));
  expect(change).toBeDisabled();
  fireEvent.click(change);
  expect(posted[1]).toEqual(posted[0]);
  resolveRetry(Response.json({ ok: true, receipt: { inquiryId, submissionId: posted[0].submissionId, status: "saved" } }));
  expect(await screen.findByRole("heading", { name: "Inquiry received" })).toHaveFocus();
});
