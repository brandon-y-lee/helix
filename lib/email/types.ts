import type { OrderConfirmationReceipt } from "@/lib/email/order-confirmation";
import type { OrderTrackingReceipt } from "@/lib/email/order-tracking";
import type { SupportAcknowledgementReceipt, SupportReplyReceipt } from "@/lib/support/email";

export type EmailRequest = {
  from: string;
  to: [string];
  reply_to: string;
  subject: string;
  html: string;
  text: string;
  tags: { name: string; value: string }[];
};

export type EmailIntent = {
  id: string;
  environment: "sandbox";
  recipient: string;
  requestPayload: EmailRequest | null;
  idempotencyKey: string;
  firstAttemptAt: string | null;
  attemptCount: number;
  leaseToken: string;
} & (
  | { purpose: "order_confirmation"; receipt: OrderConfirmationReceipt }
  | { purpose: "order_tracking"; receipt: OrderTrackingReceipt }
  | { purpose: "support_acknowledgement"; receipt: SupportAcknowledgementReceipt }
  | { purpose: "support_reply"; receipt: SupportReplyReceipt }
);

export type EmailAttemptOutcome =
  | { kind: "accepted"; id: string }
  | { kind: "retry" | "uncertain" | "blocked" | "failed"; code: string };

export interface EmailDeliveryStorage {
  claim(leaseToken: string, limit: number): Promise<EmailIntent[]>;
  prepare(id: string, leaseToken: string, payload: EmailRequest): Promise<EmailIntent | null>;
  finish(id: string, leaseToken: string, outcome: EmailAttemptOutcome): Promise<boolean>;
}
