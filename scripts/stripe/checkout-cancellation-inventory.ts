import { isTestStripeSecretKey } from "../../lib/checkout/config";
import { APPROVED_STRIPE_SANDBOX_ACCOUNT_ID } from "./sandbox-webhook";

export type CancellationInventorySession = {
  livemode: boolean;
  status: string | null;
  cancel_url: string | null;
  expires_at: number;
  after_expiration: {
    recovery: {
      enabled: boolean;
      expires_at: number | null;
    } | null;
  } | null;
};

type CancellationInventoryClient = {
  accounts: { retrieve: (id: null) => Promise<{ id: string }> };
  checkout: {
    sessions: {
      list: (params: { limit: number }) => AsyncIterable<CancellationInventorySession>;
    };
  };
};

export type CancellationInventoryReport = {
  observedAt: string;
  environment: "sandbox";
  approvedAccount: true;
  scanComplete: true;
  status: "ready" | "blocked";
  sessions: { total: number; open: number; complete: number; expired: number };
  legacySessions: number;
  blockingOpenSessions: number;
  blockingRecoveryLinks: number;
  unknownSessions: number;
  malformedCancelUrls: number;
  latestBlockingExpiry: string | null;
};

type CancellationInventoryInput = {
  secretKey: string | undefined;
  createClient: (secretKey: string) => CancellationInventoryClient;
  observedAt?: Date;
};

export class CancellationInventoryError extends Error {
  constructor(readonly code:
    | "sandbox-key-required"
    | "unapproved-account"
    | "non-sandbox-session"
    | "inventory-read-failed",
  ) {
    super(code);
    this.name = "CancellationInventoryError";
  }
}

export async function verifyCheckoutCancellationRetirement(
  input: CancellationInventoryInput,
): Promise<CancellationInventoryReport> {
  try {
    return await collectCancellationInventory(input);
  } catch (error) {
    if (error instanceof CancellationInventoryError) throw error;
    throw new CancellationInventoryError("inventory-read-failed");
  }
}

async function collectCancellationInventory(
  input: CancellationInventoryInput,
): Promise<CancellationInventoryReport> {
  if (!input.secretKey || !isTestStripeSecretKey(input.secretKey)) {
    throw new CancellationInventoryError("sandbox-key-required");
  }
  const client = input.createClient(input.secretKey);
  const account = await client.accounts.retrieve(null);
  if (account.id !== APPROVED_STRIPE_SANDBOX_ACCOUNT_ID) {
    throw new CancellationInventoryError("unapproved-account");
  }
  const report: CancellationInventoryReport = {
    observedAt: (input.observedAt ?? new Date()).toISOString(),
    environment: "sandbox",
    approvedAccount: true,
    scanComplete: true,
    status: "ready",
    sessions: { total: 0, open: 0, complete: 0, expired: 0 },
    legacySessions: 0,
    blockingOpenSessions: 0,
    blockingRecoveryLinks: 0,
    unknownSessions: 0,
    malformedCancelUrls: 0,
    latestBlockingExpiry: null,
  };
  const observedSeconds = new Date(report.observedAt).getTime() / 1000;
  let latestBlockingExpiry = 0;

  for await (const session of client.checkout.sessions.list({ limit: 100 })) {
    if (session.livemode !== false) {
      throw new CancellationInventoryError("non-sandbox-session");
    }
    report.sessions.total += 1;
    let unknown = false;
    if (
      session.status === "open" ||
      session.status === "expired" ||
      session.status === "complete"
    ) {
      report.sessions[session.status] += 1;
    } else {
      unknown = true;
    }
    let legacy = false;
    if (session.cancel_url) {
      try {
        const url = new URL(session.cancel_url);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
        legacy = decodeURIComponent(url.pathname).replace(/\/+$/, "") ===
          "/checkout/cancel";
      } catch {
        report.malformedCancelUrls += 1;
      }
    }
    if (!legacy) {
      if (unknown) report.unknownSessions += 1;
      continue;
    }
    report.legacySessions += 1;
    if (session.status === "open") {
      report.blockingOpenSessions += 1;
      if (
        Number.isFinite(new Date(session.expires_at * 1000).getTime()) &&
        session.expires_at > 0
      ) {
        latestBlockingExpiry = Math.max(latestBlockingExpiry, session.expires_at);
      } else {
        unknown = true;
      }
    }
    const recovery = session.after_expiration?.recovery;
    if (recovery?.enabled) {
      if (
        recovery.expires_at === null ||
        !Number.isFinite(new Date(recovery.expires_at * 1000).getTime()) ||
        recovery.expires_at <= 0
      ) {
        unknown = true;
      } else if (recovery.expires_at > observedSeconds) {
        report.blockingRecoveryLinks += 1;
        latestBlockingExpiry = Math.max(latestBlockingExpiry, recovery.expires_at);
      }
    }
    if (unknown) report.unknownSessions += 1;
  }
  if (
    report.blockingOpenSessions || report.blockingRecoveryLinks ||
    report.unknownSessions || report.malformedCancelUrls
  ) {
    report.status = "blocked";
  }
  if (latestBlockingExpiry) {
    report.latestBlockingExpiry = new Date(latestBlockingExpiry * 1000).toISOString();
  }
  return report;
}
