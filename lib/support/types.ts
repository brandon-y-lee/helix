export type SupportInquiryStatus = "open" | "closed";

export type SupportInquirySummary = {
  id: string;
  revision: number;
  status: SupportInquiryStatus;
  inquiryType: string;
  name: string;
  email: string;
  subject: string;
  createdAt: string;
  updatedAt: string;
  lastDeliveryState: string | null;
  pendingInbound?: number;
};

export type SupportPhoto = {
  id: string;
  status: "pending" | "processing" | "ready" | "rejected" | "expired";
  rejectionReason: string | null;
};

export type SupportQuarantinedInbound = {
  id: string;
  subject: string;
  body: string;
  receivedAt: string;
  reason: string;
  participantMatches: boolean;
  acceptAllowed: boolean;
  retryAllowed?: boolean;
};

export type SupportInboundReviewMutation = { action: "accept" | "dismiss" | "retry"; inboundId: string; expectedRevision: number };

export type SupportMessage = {
  id: string;
  kind: "inbound" | "reply" | "note";
  subject: string;
  body: string;
  createdAt: string;
  delivery: { state: string; deliveryStatus: string | null; errorCode: string | null } | null;
  photos?: SupportPhoto[];
};

export type SupportDraft = {
  id: string;
  version: number;
  inquiryRevision: number;
  recipient: string;
  subject: string;
  body: string;
  approved: boolean;
};

export type SupportInquiryDetail = SupportInquirySummary & {
  messages: SupportMessage[];
  nextMessageCursor: string | null;
  draft: SupportDraft | null;
  order: { orderNumber: string } | null;
  quarantinedInbound?: SupportQuarantinedInbound[];
};

export type SupportAiJob = {
  id: string;
  state: "queued" | "running" | "completed" | "failed" | "cancelled" | "stale";
  inquiryRevision: number;
  draftVersion: number;
  createdAt: string;
  errorCode: string | null;
  draftId: string | null;
  needsHuman: boolean | null;
  references: { id: string; text: string }[];
};

export type SupportAiStatus = { available: boolean; job: SupportAiJob | null; inquiry?: SupportInquiryDetail };

export type SupportInquiryCursor = { createdAt: string; id: string };

export type SupportInquiryList = {
  inquiries: SupportInquirySummary[];
  nextCursor: SupportInquiryCursor | null;
  previousCursor: SupportInquiryCursor | null;
};

export type SupportMutation =
  | { action: "save_draft"; expectedRevision: number; expectedDraftVersion: number; subject: string; body: string }
  | { action: "approve_reply"; expectedRevision: number; draftVersion: number }
  | { action: "add_note"; expectedRevision: number; body: string }
  | { action: "set_status"; expectedRevision: number; status: SupportInquiryStatus };
