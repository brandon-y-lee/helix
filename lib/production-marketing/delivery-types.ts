import type { ProductionMarketingHeldEnvelope } from "./capabilities";
export type PreparedMarketingMessage = { body: string; idempotencyKey: string; firstPreparedAt: string; admittedAt: string; payloadExpiresAt: string; leaseUntil: string };
export type ProductionMarketingIntent = {
  id: string; subscriberId: string; email: string; purpose: "confirmation" | "welcome"; generation: number; revision: number;
  requestId: string; issuedAt: string; expiresAt: string; confirmationHash: string; preferenceHash: string;
  envelope: ProductionMarketingHeldEnvelope | null; prepared: PreparedMarketingMessage | null;
};
export type ProductionMarketingOutcome = { kind: "accepted"; id: string } | { kind: "uncertain" };
export interface ProductionMarketingDeliveryStorage {
  cleanup(): Promise<number>;
  claim(lease: string): Promise<ProductionMarketingIntent | null>;
  prepare(id: string, lease: string, body: string, preferenceHash: string | null, contractHash: string): Promise<PreparedMarketingMessage | null>;
  admitRetry(id: string, lease: string, contractHash: string): Promise<PreparedMarketingMessage | null>;
  finish(id: string, lease: string, outcome: ProductionMarketingOutcome): Promise<boolean>;
  defer(id: string, lease: string): Promise<boolean>;
}
