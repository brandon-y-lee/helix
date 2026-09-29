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
};

export type SupportMessage = {
  id: string;
  kind: "inbound" | "reply" | "note";
  subject: string;
  body: string;
  createdAt: string;
  delivery: { state: string; deliveryStatus: string | null; errorCode: string | null } | null;
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
};

export type SupportInquiryList = {
  inquiries: SupportInquirySummary[];
  nextPage: number | null;
};

export type SupportMutation =
  | { action: "save_draft"; expectedRevision: number; expectedDraftVersion: number; subject: string; body: string }
  | { action: "approve_reply"; expectedRevision: number; draftVersion: number }
  | { action: "add_note"; expectedRevision: number; body: string }
  | { action: "set_status"; expectedRevision: number; status: SupportInquiryStatus };
