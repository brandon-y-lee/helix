import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportConversation } from "@/components/admin/support/SupportConversation";
import type { SupportAiJob, SupportInquiryDetail } from "@/lib/support/types";

afterEach(() => vi.useRealTimers());

const inquiry: SupportInquiryDetail = {
  id: "00000000-0000-4000-8000-000000000001", revision: 1, status: "open", inquiryType: "product",
  name: "Sample Customer", email: "sample@example.com", subject: "Product question",
  createdAt: "2026-09-28T12:00:00Z", updatedAt: "2026-09-28T12:00:00Z", lastDeliveryState: null,
  messages: [{ id: "message-1", kind: "inbound", subject: "Product question", body: "How can I add this to my routine?", createdAt: "2026-09-28T12:00:00Z", delivery: null }],
  draft: null, order: null, nextMessageCursor: null,
};
const queued: SupportAiJob = {
  id: "00000000-0000-4000-8000-000000000002", state: "queued", inquiryRevision: 1, draftVersion: 0,
  createdAt: inquiry.createdAt, errorCode: null, draftId: null, needsHuman: null, references: [],
};
const generated: SupportInquiryDetail = {
  ...inquiry, revision: 2,
  draft: { id: "draft-ai", version: 1, inquiryRevision: 2, recipient: inquiry.email, subject: "Re: Product question", body: "Please introduce one product at a time.", approved: false },
};
const completed: SupportAiJob = {
  ...queued, state: "completed", draftId: generated.draft!.id, needsHuman: true,
  references: [{ id: "faq:routine", text: "Introduce one product at a time." }],
};
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status }); }

describe("owner support draft assistance", () => {
  it("preserves edits through generation and requires an explicit review action before the unchanged approval flow", async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ available: true, job: queued }))
      .mockResolvedValueOnce(json({ available: true, job: completed, inquiry: generated }))
      .mockResolvedValueOnce(json({ inquiry: { ...generated, draft: { ...generated.draft, approved: true } } }));
    render(<SupportConversation initialInquiry={inquiry} canReply initialAiStatus={{ available: true, job: null }} request={request} />);
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "My unfinished reply." } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Generate draft" })); });
    expect(screen.getByLabelText("Reply")).toBeEnabled();
    expect(screen.getByLabelText("Reply")).toHaveValue("My unfinished reply.");
    fireEvent.change(screen.getByLabelText("Reply subject"), { target: { value: "My subject" } });
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "My edits while generation runs." } });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByLabelText("Reply")).toHaveValue("My edits while generation runs.");
    expect(screen.getByLabelText("Reply subject")).toHaveValue("My subject");
    expect(screen.getByText(/Additional human review is needed/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Saved reply for approval" })).getByText(generated.draft!.body)).toBeInTheDocument();
    expect(screen.getByText("Introduce one product at a time.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve and queue reply" })).toBeDisabled();
    expect(request.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Load generated draft into editor" })); });
    expect(screen.getByLabelText("Reply")).toHaveValue(generated.draft!.body);
    expect(screen.getByRole("button", { name: "Approve and queue reply" })).toBeEnabled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Approve and queue reply" })); });
    expect(JSON.parse(request.mock.calls[2][1]!.body as string)).toEqual({ action: "approve_reply", expectedRevision: 2, draftVersion: 1 });
    expect(screen.getByText(/Reply approved and queued/)).toBeInTheDocument();
  });

  it("cancels a running job, stops polling, and leaves the manual reply available", async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ available: true, job: { ...queued, state: "cancelled" } }));
    const { unmount } = render(<SupportConversation initialInquiry={inquiry} canReply initialAiStatus={{ available: true, job: { ...queued, state: "running" } }} request={request} />);
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "A manual reply to keep." } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cancel draft generation" })); });
    expect(screen.getByText(/Draft generation cancelled/)).toBeInTheDocument();
    expect(screen.getByLabelText("Reply")).toHaveValue("A manual reply to keep.");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    expect(JSON.parse(request.mock.calls[0][1]!.body as string)).toEqual({ action: "cancel", jobId: queued.id });
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    expect(request).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("retries an uncertain request with its original identity and keeps failures separate from manual saving", async () => {
    const manual = { ...generated, draft: { ...generated.draft!, body: "My manual answer." } };
    const request = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("private transport detail"))
      .mockResolvedValueOnce(json({ inquiry: manual }))
      .mockResolvedValueOnce(json({ available: true, job: { ...queued, state: "failed", errorCode: "private_runtime_detail" } }));
    render(<SupportConversation initialInquiry={inquiry} canReply initialAiStatus={{ available: true, job: null }} request={request} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Generate draft" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("Draft status could not be confirmed");
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "My manual answer." } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save draft" })); });
    expect(screen.getByRole("button", { name: "Approve and queue reply" })).toBeEnabled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry draft request" })); });
    const original = JSON.parse(request.mock.calls[0][1]!.body as string);
    expect(original).toEqual({ action: "request", requestId: expect.stringMatching(/^[\da-f-]{36}$/), expectedRevision: 1, expectedDraftVersion: 0 });
    expect(JSON.parse(request.mock.calls[2][1]!.body as string)).toEqual(original);
    expect(screen.getByText(/Draft generation failed/)).toBeInTheDocument();
    expect(screen.getByLabelText("Reply")).toHaveValue("My manual answer.");
    expect(screen.getByRole("button", { name: "Approve and queue reply" })).toBeEnabled();
    expect(document.body.textContent).not.toMatch(/private transport detail|private_runtime_detail/);
  });

  it("checks after reconnection without replacing a newer saved reply, and stops checking after unmount", async () => {
    vi.useFakeTimers();
    const current = { ...generated, revision: 3, draft: { ...generated.draft!, id: "manual-draft", version: 2, inquiryRevision: 3, body: "The newer saved reply." } };
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ available: true, job: completed, inquiry: generated }));
    const { unmount } = render(<SupportConversation initialInquiry={current} canReply initialAiStatus={{ available: true, job: queued }} request={request} />);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(screen.getByLabelText("Reply")).toHaveValue("The newer saved reply.");
    expect(within(screen.getByRole("region", { name: "Saved reply for approval" })).getByText("The newer saved reply.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load generated draft into editor" })).not.toBeInTheDocument();
    expect(screen.queryByText("Introduce one product at a time.")).not.toBeInTheDocument();
    expect(screen.getByText(/Generated draft is no longer the current saved reply/)).toBeInTheDocument();
    unmount();
    await act(async () => { window.dispatchEvent(new Event("online")); await vi.advanceTimersByTimeAsync(12_000); });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("stops a stale job and asks for conversation review without replacing local text", async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ available: true, job: { ...queued, state: "stale" } }));
    render(<SupportConversation initialInquiry={inquiry} canReply initialAiStatus={{ available: true, job: queued }} request={request} />);
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Keep this local answer." } });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByText(/Draft generation stopped because the conversation changed/)).toBeInTheDocument();
    expect(screen.getByLabelText("Reply")).toHaveValue("Keep this local answer.");
    expect(screen.getByRole("button", { name: "Generate draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["authentication_required", "Draft worker needs owner attention. Check its sign-in before retrying, or continue with a manual reply."],
    ["runtime_mismatch", "Draft worker needs owner attention. Check its setup before retrying, or continue with a manual reply."],
    ["quota_exceeded", "Drafting allowance is unavailable. Retry after it resets, or continue with a manual reply."],
  ])("explains the safe recovery for %s without exposing internal details", (errorCode, message) => {
    render(<SupportConversation initialInquiry={inquiry} canReply initialAiStatus={{ available: true, job: { ...queued, state: "failed", errorCode } }} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText("Reply")).toBeEnabled();
    expect(document.body.textContent).not.toContain(errorCode);
  });

  it("requires reopening a closed inquiry before generation", () => {
    render(<SupportConversation initialInquiry={{ ...inquiry, status: "closed" }} canReply initialAiStatus={{ available: true, job: null }} />);
    expect(screen.getByRole("button", { name: "Generate draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reopen inquiry" })).toBeEnabled();
    expect(screen.getByLabelText("Reply")).toBeEnabled();
  });
});
