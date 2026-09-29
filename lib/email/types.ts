import type { OrderConfirmationReceipt } from "@/lib/email/order-confirmation";

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
  purpose: "order_confirmation";
  recipient: string;
  receipt: OrderConfirmationReceipt;
  requestPayload: EmailRequest | null;
  idempotencyKey: string;
  firstAttemptAt: string | null;
  attemptCount: number;
  leaseToken: string;
};

export type EmailAttemptOutcome =
  | { kind: "accepted"; id: string }
  | { kind: "retry" | "uncertain" | "blocked" | "failed"; code: string };

export interface EmailDeliveryStorage {
  claim(leaseToken: string, limit: number): Promise<EmailIntent[]>;
  prepare(id: string, leaseToken: string, payload: EmailRequest): Promise<EmailIntent | null>;
  finish(id: string, leaseToken: string, outcome: EmailAttemptOutcome): Promise<boolean>;
}
