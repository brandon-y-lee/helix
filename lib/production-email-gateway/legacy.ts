import "server-only";
import { createHash } from "node:crypto";
import { HASH, UUID } from "@/lib/support/production/config";

const targetRef = "erasogmsqpgiirovubjh" as const;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && HASH.test(v);
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
export type LegacyOutgoing = { messageId: string; purpose: string } & (
  { kind: "message"; providerId: string; senderHash: string; recipientHash: string } |
  { kind: "tombstone"; providerId: string } | { kind: "blocked"; providerId: null });
export type LegacySnapshot = {
  version: 1; targetRef: typeof targetRef; snapshotId: string; complete: true;
  outgoing: LegacyOutgoing[];
  aliases: { addressHash: string; inquiryId: string }[];
  inbound: { eventId: string; providerId: string; senderHash: string; recipientSetHash: string }[];
};
export type LegacyReceipt = { snapshotId: string; targetRef: typeof targetRef; eventId: string; messageId: string;
  providerId: string; purpose: string; eventType: string; occurredAt: string; sender?: string; recipient?: string;
  rfcMessageId?: string; tombstone: boolean };
export type LegacyInbound = { snapshotId: string; targetRef: typeof targetRef; eventId: string; providerId: string;
  sender: string; recipients: string[]; occurredAt: string; inquiryId?: string };
export type LegacyDelegates = { snapshot: unknown;
  receipt?: (event: LegacyReceipt) => Promise<"recorded" | "duplicate" | "conflict" | "unmatched" | "paused">;
  queue?: (event: LegacyInbound) => Promise<{ status: string; id?: unknown }> };
const keys = (row: Record<string, unknown>, allowed: string[]) => Object.keys(row).every((key) => allowed.includes(key));
function unique(values: string[]): boolean { return new Set(values).size === values.length; }
/** Operator-supplied frozen evidence, never a query or an environment fallback. */
export function parseLegacySnapshot(value: unknown): LegacySnapshot {
  if (!object(value) || !keys(value, ["version", "targetRef", "snapshotId", "complete", "outgoing", "aliases", "inbound"])
    || value.version !== 1 || value.targetRef !== targetRef || !uuid(value.snapshotId) || value.complete !== true
    || !Array.isArray(value.outgoing) || !Array.isArray(value.aliases) || !Array.isArray(value.inbound)
    || [value.outgoing, value.aliases, value.inbound].some((rows) => rows.length > 1000)) throw new Error("Legacy snapshot unavailable");
  for (const row of value.outgoing) {
    if (!object(row) || !uuid(row.messageId) || typeof row.purpose !== "string" || !/^[a-z_]{1,64}$/.test(row.purpose)
      || (row.kind === "blocked" ? row.providerId !== null || !keys(row, ["kind", "messageId", "providerId", "purpose"])
        : !uuid(row.providerId) || (row.kind === "tombstone" ? !keys(row, ["kind", "messageId", "providerId", "purpose"])
          : row.kind !== "message" || !hash(row.senderHash) || !hash(row.recipientHash)
            || !keys(row, ["kind", "messageId", "providerId", "purpose", "senderHash", "recipientHash"])))) throw new Error("Legacy snapshot unavailable");
  }
  for (const row of value.aliases) if (!object(row) || !keys(row, ["addressHash", "inquiryId"]) || !hash(row.addressHash) || !uuid(row.inquiryId)) throw new Error("Legacy snapshot unavailable");
  for (const row of value.inbound) if (!object(row) || !keys(row, ["eventId", "providerId", "senderHash", "recipientSetHash"])
    || typeof row.eventId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(row.eventId) || !uuid(row.providerId)
    || !hash(row.senderHash) || !hash(row.recipientSetHash)) throw new Error("Legacy snapshot unavailable");
  const snapshot = value as LegacySnapshot;
  if (!unique(snapshot.outgoing.map((r) => r.messageId.toLowerCase()))
    || !unique(snapshot.outgoing.flatMap((r) => r.providerId ? [r.providerId.toLowerCase()] : []))
    || !unique(snapshot.aliases.map((r) => r.addressHash)) || !unique(snapshot.inbound.map((r) => r.eventId))
    || !unique(snapshot.inbound.map((r) => r.providerId.toLowerCase()))) throw new Error("Legacy snapshot unavailable");
  // Do not let a caller mutate the validated snapshot while an event is being classified.
  return structuredClone(snapshot);
}
export function mailbox(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512 || /[\r\n\0]/.test(value)) return null;
  const address = value.trim().match(/^(?:[^<>,;]{1,200}\s+<([^<>\s]+)>|([^<>\s,;]+@[^<>\s,;]+))$/);
  const normalized = (address?.[1] ?? address?.[2] ?? "").toLowerCase();
  return normalized.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) ? normalized : null;
}
export function recipientSetHash(recipients: string[]): string { return digest([...new Set(recipients)].sort().join("\n")); }
export function legacyReceipt(snapshot: LegacySnapshot, eventId: string, type: string, occurredAt: string, data: Record<string, unknown>): LegacyReceipt | null {
  const tags = data.tags as Record<string, string>, row = snapshot.outgoing.find((r) => r.messageId.toLowerCase() === tags.helix_message_id.toLowerCase());
  if (!row || row.kind === "blocked" || typeof data.email_id !== "string" || row.providerId.toLowerCase() !== data.email_id.toLowerCase()
    || typeof data.from !== "string" || !Array.isArray(data.to) || data.to.length !== 1
    || [data.cc, data.bcc].some((v) => v !== undefined && (!Array.isArray(v) || v.length !== 0))) return null;
  const recipient = mailbox(data.to[0]);
  if (!recipient || (row.kind === "message" && (row.senderHash !== digest(data.from) || row.recipientHash !== digest(recipient)))) return null;
  const rfc = data.message_id;
  if (rfc !== undefined && (typeof rfc !== "string" || rfc.length > 998 || /[\r\n\0]/.test(rfc))) return null;
  return { snapshotId: snapshot.snapshotId, targetRef, eventId, messageId: row.messageId, providerId: row.providerId,
    purpose: row.purpose, eventType: type, occurredAt, tombstone: row.kind === "tombstone",
    ...(row.kind === "message" ? { sender: data.from, recipient, ...(typeof rfc === "string" ? { rfcMessageId: rfc } : {}) } : {}) };
}
/** null is a proved exclusion. Unavailable/ambiguous ownership throws and must retry. */
export function legacyInbound(snapshot: LegacySnapshot, eventId: string, occurredAt: string, data: Record<string, unknown>): LegacyInbound | null {
  const fields = [data.to, data.cc === undefined ? [] : data.cc, data.bcc === undefined ? [] : data.bcc, data.received_for === undefined ? [] : data.received_for];
  if (fields.some((v) => !Array.isArray(v)) || fields.reduce<number>((n, v) => n + (v as unknown[]).length, 0) > 100) throw new Error("Unproved recipient set");
  const addresses = fields.flatMap((v) => (v as unknown[]).map(mailbox));
  if (addresses.some((v) => v === null)) throw new Error("Unproved recipient set");
  const recipients = [...new Set(addresses as string[])], sender = mailbox(data.from);
  if (!sender || recipients.length === 0 || !uuid(data.email_id)) throw new Error("Unproved envelope");
  const providerId = data.email_id;
  const known = snapshot.inbound.find((r) => r.eventId === eventId || r.providerId.toLowerCase() === providerId.toLowerCase());
  if (known) {
    if (known.eventId !== eventId || known.providerId.toLowerCase() !== data.email_id.toLowerCase()
      || known.senderHash !== digest(sender) || known.recipientSetHash !== recipientSetHash(recipients)) throw new Error("Conflicting inbound identity");
    return { snapshotId: snapshot.snapshotId, targetRef, eventId, providerId: data.email_id, sender, recipients, occurredAt };
  }
  const aliases = recipients.map((address) => snapshot.aliases.find((r) => r.addressHash === digest(address)));
  const proved = aliases.filter((r) => r !== undefined);
  if (proved.length === 0) return null;
  if (new Set(proved.map((r) => r.inquiryId.toLowerCase())).size !== 1
    || recipients.some((address, i) => !aliases[i] && address !== "support@helixskin.us")) throw new Error("Ambiguous inbound ownership");
  return { snapshotId: snapshot.snapshotId, targetRef, eventId, providerId: data.email_id, sender, recipients, occurredAt, inquiryId: proved[0].inquiryId };
}
