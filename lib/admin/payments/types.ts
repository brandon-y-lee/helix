import type { PaymentOperations } from "@/lib/payments/inbox";

export type PaymentReplayInput = {
  itemId: string;
  expectedVersion: number;
  reason: string;
  requestId: string;
  dryRun: boolean;
};

export type PaymentOperationsView = Omit<PaymentOperations, "refunds"> & {
  refunds: Omit<PaymentOperations["refunds"][number], "orderId">[];
  health: {
    heartbeatStale: boolean;
    heartbeatAgeSeconds: number | null;
    oldestPendingAgeSeconds: number | null;
    overdue: boolean;
    queueDepth: number;
  };
};
