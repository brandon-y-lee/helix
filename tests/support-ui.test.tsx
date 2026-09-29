import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactForm } from "@/components/support/ContactForm";
import { SupportConversation } from "@/components/admin/support/SupportConversation";
import type { SupportInquiryDetail } from "@/lib/support/types";

const pageAccess = vi.hoisted(() => ({ authorize: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/admin/capabilities", () => ({ requireAdminCapability: pageAccess.authorize }));
vi.mock("@/lib/support/service", () => ({ getSupportInquiryForActor: pageAccess.load, requireSupportAccess: pageAccess.authorize }));

afterEach(() => vi.unstubAllGlobals());

describe("Support Intake", () => {
  it("only offers submission after availability is confirmed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ available: false }))));
    render(<ContactForm />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking support availability");
    expect(screen.queryByRole("button", { name: "Submit inquiry" })).not.toBeInTheDocument();
    expect(await screen.findByText("Support Intake is currently unavailable.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Email" })).not.toBeInTheDocument();
  });

  it("distinguishes an availability check failure from a confirmed closure and lets the visitor retry", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true })));
    vi.stubGlobal("fetch", fetch);
    render(<ContactForm />);
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t check support availability");
    expect(screen.queryByRole("button", { name: "Submit inquiry" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Check availability again" }));
    expect(await screen.findByRole("button", { name: "Submit inquiry" })).toBeInTheDocument();
  });

  it("retries an uncertain submission with the same identity and confirms receipt without promising email", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true })))
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    render(<ContactForm />);
    await screen.findByRole("button", { name: "Submit inquiry" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sample Customer" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sample@example.com" } });
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "A product question" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Is this suitable for my routine?" } });
    await userEvent.click(screen.getByRole("button", { name: "Submit inquiry" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t confirm receipt");
    await userEvent.click(screen.getByRole("button", { name: "Submit inquiry" }));
    expect(await screen.findByRole("heading", { name: "Inquiry received" })).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent(/email sent|check your inbox/i);
    const first = JSON.parse(fetch.mock.calls[1][1].body);
    const second = JSON.parse(fetch.mock.calls[2][1].body);
    expect(first.submissionId).toMatch(/^[\da-f-]{36}$/);
    expect(second).toEqual(first);
  });
});

const inquiry: SupportInquiryDetail = {
  id: "00000000-0000-4000-8000-000000000001", revision: 1, status: "open", inquiryType: "product",
  name: "Sample Customer", email: "sample@example.com", subject: "Product question",
  createdAt: "2026-09-28T12:00:00Z", updatedAt: "2026-09-28T12:00:00Z", lastDeliveryState: null,
  messages: [{ id: "message-1", kind: "inbound", subject: "Product question", body: '<img src="https://unsafe.example/photo" onerror="alert(1)">', createdAt: "2026-09-28T12:00:00Z", delivery: null }],
  draft: null, order: null, nextMessageCursor: null,
};

describe("private support conversation", () => {
  it("saves a reply without sending and requires explicit approval of the saved content", async () => {
    const saved: SupportInquiryDetail = { ...inquiry, revision: 2, draft: { id: "draft-1", version: 1, inquiryRevision: 2, recipient: inquiry.email, subject: "Re: Product question", body: "Thank you for your question.", approved: false } };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ inquiry: saved })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ inquiry: { ...saved, draft: { ...saved.draft, approved: true } } })));
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<SupportConversation initialInquiry={inquiry} canReply />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(inquiry.messages[0].body)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Thank you for your question." } });
    expect(screen.getByRole("button", { name: "Approve and queue reply" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Draft saved");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: "save_draft", expectedRevision: 1, expectedDraftVersion: 0, subject: "Re: Product question", body: "Thank you for your question." });
    expect(screen.getByLabelText("Recipient")).toHaveValue(inquiry.email);
    expect(screen.getByLabelText("Recipient")).toHaveAttribute("readonly");
    await userEvent.click(screen.getByRole("button", { name: "Approve and queue reply" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ action: "approve_reply", expectedRevision: 2, draftVersion: 1 });
    expect(await screen.findByRole("status")).toHaveTextContent("Reply approved");
    expect(screen.getByRole("button", { name: "Approve and queue reply" })).toBeDisabled();
  });

  it("reloads conflicting context and prevents approval until a draft is saved against the new inquiry", async () => {
    const saved: SupportInquiryDetail = { ...inquiry, draft: { id: "draft-1", version: 1, inquiryRevision: 1, recipient: inquiry.email, subject: "Re: Product question", body: "A saved reply.", approved: false } };
    const fresh: SupportInquiryDetail = { ...saved, revision: 3, messages: [...inquiry.messages, { id: "message-2", kind: "note", subject: "", body: "New information needs review.", createdAt: inquiry.createdAt, delivery: null }] };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: { code: "stale_inquiry", message: "private server detail" } }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ inquiry: fresh })));
    vi.stubGlobal("fetch", fetch);
    render(<SupportConversation initialInquiry={saved} canReply />);
    await userEvent.click(screen.getByRole("button", { name: "Approve and queue reply" }));
    expect(await screen.findByText("New information needs review.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Review the latest conversation");
    expect(screen.getByRole("button", { name: "Approve and queue reply" })).toBeDisabled();
    expect(screen.getByLabelText("Reply")).toHaveValue("A saved reply.");
    expect(screen.queryByText("private server detail")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].cache).toBe("no-store");
  });

  it("keeps notes private and closes an inquiry without claiming a reply was delivered", async () => {
    const reply = { id: "reply-1", kind: "reply" as const, subject: "Re: Product question", body: "Reply awaiting delivery.", createdAt: inquiry.createdAt, delivery: { state: "accepted", deliveryStatus: null, errorCode: null } };
    const current = { ...inquiry, messages: [...inquiry.messages, reply] };
    const noted: SupportInquiryDetail = { ...current, revision: 2, messages: [...current.messages, { id: "note-1", kind: "note", subject: "", body: "Owner should review this question.", createdAt: inquiry.createdAt, delivery: null }] };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ inquiry: noted })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ inquiry: { ...noted, revision: 3, status: "closed" } })));
    vi.stubGlobal("fetch", fetch);
    render(<SupportConversation initialInquiry={current} canReply />);
    fireEvent.change(screen.getByLabelText("Internal note"), { target: { value: "Owner should review this question." } });
    await userEvent.click(screen.getByRole("button", { name: "Add internal note" }));
    expect(await screen.findByText("Owner should review this question.")).toBeInTheDocument();
    expect(screen.getByText("Internal note · visible only to support")).toBeInTheDocument();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: "add_note", expectedRevision: 1, body: "Owner should review this question." });
    expect(screen.getByRole("button", { name: "Close inquiry" })).toHaveAccessibleDescription(/invalidates a queued reply approval/i);
    await userEvent.click(screen.getByRole("button", { name: "Close inquiry" }));
    expect(await screen.findByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("Email accepted; delivery unconfirmed")).toBeInTheDocument();
    expect(screen.queryByText("Email delivered")).not.toBeInTheDocument();
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ action: "set_status", expectedRevision: 2, status: "closed" });
  });

  it("does not load private inquiry data when page authorization fails", async () => {
    pageAccess.authorize.mockRejectedValueOnce(new Error("private error detail"));
    const { default: InquiryPage } = await import("@/app/admin/support/[inquiryId]/page");
    render(await InquiryPage({ params: Promise.resolve({ inquiryId: inquiry.id }) }));
    expect(pageAccess.load).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Support inquiry unavailable");
    expect(screen.queryByText("private error detail")).not.toBeInTheDocument();
  });

  it("allows read-only conversation refresh without offering reply or status mutations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ inquiry }))));
    render(<SupportConversation initialInquiry={inquiry} canReply={false} />);
    expect(screen.queryByRole("button", { name: "Close inquiry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Reply" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Internal note" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Refresh inquiry" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Conversation refreshed");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows retained inquiry history without offering changes after content removal", () => {
    const request = vi.fn();
    render(<SupportConversation initialInquiry={{ ...inquiry, status: "closed", redactedAt: inquiry.updatedAt, messages: [] }} canReply initialAiStatus={{ available: true, job: null }} request={request} />);
    expect(screen.getByText("This inquiry’s content has been removed under the retention policy. It cannot be reopened or changed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reopen inquiry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Reply" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Internal note" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate draft" })).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["Refresh inquiry", "Load earlier messages"])("replaces previously visible content when %s discovers retention", async (action) => {
    const redacted = { ...inquiry, revision: 2, status: "closed", redactedAt: inquiry.updatedAt, subject: "Content removed", name: "", email: "", messages: [] };
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ inquiry: redacted })));
    render(<SupportConversation initialInquiry={{ ...inquiry, nextMessageCursor: "00000000-0000-4000-8000-000000000020" }} canReply request={request} />);
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Local reply text." } });
    await userEvent.click(screen.getByRole("button", { name: action }));
    expect(await screen.findByText("This inquiry’s content has been removed under the retention policy. It cannot be reopened or changed.")).toBeInTheDocument();
    expect(screen.queryByText(inquiry.messages[0].body)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Reply" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reopen inquiry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load earlier messages" })).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("loads earlier messages once each while preserving unsaved reply content and its current context", async () => {
    const cursor = "00000000-0000-4000-8000-000000000020";
    const initial = { ...inquiry, nextMessageCursor: cursor };
    const older = { id: "00000000-0000-4000-8000-000000000010", kind: "note" as const, subject: "", body: "An earlier private note.", createdAt: "2026-09-27T12:00:00Z", delivery: null };
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ inquiry: { ...inquiry, revision: 5, messages: [older, ...inquiry.messages], nextMessageCursor: null } })));
    vi.stubGlobal("fetch", fetch);
    render(<SupportConversation initialInquiry={initial} canReply />);
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Unfinished local reply." } });
    await userEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
    expect(await screen.findByText("An earlier private note.")).toBeInTheDocument();
    expect(screen.getAllByText(inquiry.messages[0].body)).toHaveLength(1);
    expect(screen.getByLabelText("Reply")).toHaveValue("Unfinished local reply.");
    expect(screen.queryByRole("button", { name: "Load earlier messages" })).not.toBeInTheDocument();
    expect(fetch.mock.calls[0][0]).toBe(`/api/admin/support/${inquiry.id}?before=${cursor}`);
    expect(fetch.mock.calls[0][1].cache).toBe("no-store");
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ inquiry: { ...inquiry, revision: 2, draft: { id: "draft-1", version: 1, inquiryRevision: 2, recipient: inquiry.email, subject: "Re: Product question", body: "Unfinished local reply.", approved: false } } })));
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetch.mock.calls[1][1].body).expectedRevision).toBe(1);
  });

  it("requires a refresh when an older-page response reveals newer unseen activity", async () => {
    const current: SupportInquiryDetail = { ...inquiry, nextMessageCursor: "00000000-0000-4000-8000-000000000020", draft: { id: "draft-1", version: 1, inquiryRevision: 1, recipient: inquiry.email, subject: "Saved subject", body: "Saved reply", approved: false } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ inquiry: { ...current, revision: 5, messages: [], nextMessageCursor: null } }))));
    render(<SupportConversation initialInquiry={current} canReply />);
    expect(screen.getByRole("button", { name: "Approve and queue reply" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("newer activity");
    expect(screen.getByRole("button", { name: "Approve and queue reply" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Conversation" })).toHaveFocus();
  });
});
