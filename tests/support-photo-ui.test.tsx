import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactForm } from "@/components/support/ContactForm";
import { SupportConversation } from "@/components/admin/support/SupportConversation";
import type { SupportInquiryDetail } from "@/lib/support/types";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("support photo selection", () => {
  it("keeps text intake available without offering photos when their service is disabled", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ available: true, photosAvailable: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    render(<ContactForm />);
    expect(await screen.findByRole("button", { name: "Submit inquiry" })).toBeEnabled();
    expect(screen.queryByLabelText("Photos (optional)")).not.toBeInTheDocument();
    expect(screen.getByText(/Photo attachments are currently unavailable/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sample Customer" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sample@example.com" } });
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "A question" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please help." } });
    await userEvent.click(screen.getByRole("button", { name: "Submit inquiry" }));
    expect(await screen.findByRole("heading", { name: "Inquiry received" })).toBeInTheDocument();
    const input = JSON.parse(fetch.mock.calls[1][1].body);
    expect(input).not.toHaveProperty("photos");
    expect(input).not.toHaveProperty("uploadCapability");
  });
  it("explains the photo limits and rejects an unsupported selection before submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ available: true, photosAvailable: true }))));
    render(<ContactForm />);
    await screen.findByRole("button", { name: "Submit inquiry" });
    const input = screen.getByLabelText("Photos (optional)");
    expect(input).toHaveAccessibleDescription(/five JPEG, PNG, or WebP photos.*10 MiB each.*20 MiB total/i);
    fireEvent.change(input, { target: { files: [new File(["<svg/>"], "photo.svg", { type: "image/svg+xml" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Photos were not added. Choose JPEG, PNG, or WebP files.");
    expect(screen.getByRole("button", { name: "Submit inquiry" })).toBeEnabled();
  });

  it.each([
    { sizes: [1, 1, 1, 1, 1, 1], message: "Choose no more than five photos." },
    { sizes: [10 * 1024 * 1024 + 1], message: "Each photo must be no larger than 10 MiB." },
    { sizes: [8 * 1024 * 1024, 8 * 1024 * 1024, 8 * 1024 * 1024], message: "Photos must total no more than 20 MiB." },
  ])("rejects a photo batch outside the published bounds: $message", async ({ sizes, message }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ available: true, photosAvailable: true }))));
    render(<ContactForm />);
    await screen.findByRole("button", { name: "Submit inquiry" });
    const files = sizes.map((size, index) => {
      const file = new File(["photo"], `photo-${index}.jpg`, { type: "image/jpeg" });
      Object.defineProperty(file, "size", { value: size });
      return file;
    });
    fireEvent.change(screen.getByLabelText("Photos (optional)"), { target: { files } });
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("button", { name: /Remove photo-/ })).not.toBeInTheDocument();
  });

  it("keeps accepted text after a photo upload fails and retries only that photo", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true, photosAvailable: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, photoId: "photo-1", uploadUrl: "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/upload/sign/support-photo-quarantine/photo-1?token=private" })))
      .mockRejectedValueOnce(new Error("upload failed"));
    vi.stubGlobal("fetch", fetch);
    render(<ContactForm />);
    await screen.findByRole("button", { name: "Submit inquiry" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sample Customer" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sample@example.com" } });
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "A damaged product" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please review this photo." } });
    fireEvent.change(screen.getByLabelText("Photos (optional)"), { target: { files: [new File(["photo"], "damage.jpg", { type: "image/jpeg" })] } });
    await userEvent.click(screen.getByRole("button", { name: "Submit inquiry" }));
    expect(await screen.findByRole("heading", { name: "Inquiry received" })).toHaveFocus();
    expect(await screen.findByText(/Upload could not be confirmed/)).toBeInTheDocument();
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: "Asset Already Exists" }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, status: "processing" })));
    await userEvent.click(screen.getByRole("button", { name: "Retry damage.jpg" }));
    expect(await screen.findByText("Processing — not yet available to support")).toBeInTheDocument();
    const intakeCalls = fetch.mock.calls.filter(([url, options]) => url === "/api/support/intake" && options?.method === "POST");
    expect(intakeCalls).toHaveLength(1);
    const accepted = JSON.parse(intakeCalls[0][1].body);
    expect(accepted.uploadCapability).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(accepted.photos).toHaveLength(1);
    expect(accepted.photos[0]).toEqual({ uploadId: expect.any(String), byteSize: 5, contentType: "image/jpeg" });
    expect(screen.queryByRole("button", { name: "Submit inquiry" })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(accepted.uploadCapability);
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, photos: [{ id: "photo-1", uploadId: accepted.photos[0].uploadId, status: "rejected", rejectionReason: "private decoder details" }] })));
    await userEvent.click(screen.getByRole("button", { name: "Check photo status" }));
    expect(await screen.findByText("Not added — this photo could not be accepted")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Inquiry received" })).toBeInTheDocument();
    expect(screen.queryByText("private decoder details")).not.toBeInTheDocument();
  });
});

const inquiry: SupportInquiryDetail = {
  id: "00000000-0000-4000-8000-000000000001", revision: 2, status: "open", inquiryType: "product",
  name: "Sample Customer", email: "sample@example.com", subject: "Product question",
  createdAt: "2026-09-28T12:00:00Z", updatedAt: "2026-09-28T12:00:00Z", lastDeliveryState: null,
  messages: [{ id: "message-1", kind: "inbound", subject: "Product question", body: "Please review my photos.", createdAt: "2026-09-28T12:00:00Z", delivery: null }],
  draft: { id: "draft-1", version: 1, inquiryRevision: 2, recipient: "sample@example.com", subject: "Re: Product question", body: "Thank you for your question.", approved: false },
  order: null, nextMessageCursor: null,
};

describe("private support photo context", () => {
  it("blocks approval while accepted inbound context is processing even when the saved revision matches", () => {
    render(<SupportConversation initialInquiry={{ ...inquiry, pendingInbound: 1 }} canReply />);
    expect(screen.getByRole("button", { name: "Approve and queue reply" })).toBeDisabled();
    expect(screen.getByText(/Incoming messages or photos are still being checked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });

  it("keeps quarantined email escaped and limits read-only and unsafe review actions", () => {
    const incoming = { id: "incoming-1", subject: "Unverified reply", body: '<img src="https://unsafe.example/tracker" onerror="alert(1)">', receivedAt: inquiry.createdAt, reason: "automated_message", participantMatches: true, acceptAllowed: false };
    const { container } = render(<SupportConversation initialInquiry={{ ...inquiry, quarantinedInbound: [incoming] }} canReply={false} />);
    expect(screen.getByRole("heading", { name: "Incoming email for review" })).toBeInTheDocument();
    expect(screen.getByText(incoming.body)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add to this conversation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss incoming email" })).not.toBeInTheDocument();
  });

  it("reviews an eligible incoming email explicitly and keeps local reply edits", async () => {
    const incoming = { id: "00000000-0000-4000-8000-000000000002", subject: "A forwarded reply", body: "Additional context", receivedAt: inquiry.createdAt, reason: "forwarded_content", participantMatches: true, acceptAllowed: true };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ inquiry: { ...inquiry, revision: 3, quarantinedInbound: [] } })));
    vi.stubGlobal("fetch", fetch);
    render(<SupportConversation initialInquiry={{ ...inquiry, quarantinedInbound: [incoming] }} canReply />);
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "My unsaved reply." } });
    await userEvent.click(screen.getByRole("button", { name: "Add to this conversation" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Incoming email added");
    expect(screen.getByLabelText("Reply")).toHaveValue("My unsaved reply.");
    expect(screen.getByRole("button", { name: "Approve and queue reply" })).toBeDisabled();
    expect(fetch.mock.calls[0][0]).toBe(`/api/admin/support/${inquiry.id}/inbound`);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: "accept", inboundId: incoming.id, expectedRevision: 2 });
  });

  it("offers only ready photos for private viewing and keeps access errors generic", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "private provider detail" } }), { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    render(<SupportConversation initialInquiry={{ ...inquiry, messages: [{ ...inquiry.messages[0], photos: [
      { id: "00000000-0000-4000-8000-000000000003", status: "ready", rejectionReason: null },
      { id: "pending", status: "processing", rejectionReason: null },
      { id: "rejected", status: "rejected", rejectionReason: "untrusted server details" },
    ] }] }} canReply={false} />);
    expect(screen.getAllByRole("button", { name: /View private photo/ })).toHaveLength(1);
    expect(screen.getByText("Photo 2: Processing")).toBeInTheDocument();
    expect(screen.getByText("Photo 3: Not accepted")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "View private photo 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This photo could not be opened");
    expect(screen.queryByText("private provider detail")).not.toBeInTheDocument();
    expect(screen.queryByText("untrusted server details")).not.toBeInTheDocument();
    expect(fetch.mock.calls[0][0]).toBe(`/api/admin/support/${inquiry.id}/photos/00000000-0000-4000-8000-000000000003`);
  });

  it.each([true, false])("expires a private photo and restores focus only when it was inside the preview: %s", async (insidePreview) => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:private-photo");
    const revoke = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
    const photoId = "00000000-0000-4000-8000-000000000003";
    const path = `/api/admin/support/${inquiry.id}/photos/${photoId}`;
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: `${path}?capability=private`, expiresAt: new Date(Date.now() + 60_000).toISOString() })))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } }));
    vi.stubGlobal("fetch", fetch);
    render(<SupportConversation initialInquiry={{ ...inquiry, messages: [{ ...inquiry.messages[0], photos: [{ id: photoId, status: "ready", rejectionReason: null }] }] }} canReply={false} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "View private photo 1" })); });
    expect(screen.getByRole("img", { name: "Customer attachment 1" })).toHaveAttribute("src", "blob:private-photo");
    expect(document.querySelector('a[href*="capability"]')).toBeNull();
    const outsideButton = screen.getByRole("button", { name: "Refresh inquiry" });
    (insidePreview ? screen.getByRole("button", { name: "Close photo 1" }) : outsideButton).focus();
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Photo access expired");
    expect(revoke).toHaveBeenCalledWith("blob:private-photo");
    expect(screen.getByRole("button", { name: "View private photo 1" })).toBeEnabled();
    expect(insidePreview ? screen.getByRole("button", { name: "View private photo 1" }) : outsideButton).toHaveFocus();
  });
});
