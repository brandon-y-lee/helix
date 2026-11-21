import "server-only";

export const productionMarketingStatusFields = [
  "pendingSubscribers", "confirmedSubscribers", "withdrawnSubscribers", "suppressedSubscribers",
  "queuedMessages", "preparedMessages", "acceptedMessages", "deliveredMessages", "suppressedMessages",
  "failedMessages", "uncertainMessages",
] as const;
const directStatusFields = [...productionMarketingStatusFields, "unresolvedPreferenceHolds"] as const;
export type ProductionMarketingStatus = Record<typeof productionMarketingStatusFields[number], number>;

function parseCounts<Key extends string>(value: unknown, fields: readonly Key[]): Record<Key, number> | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== fields.length) {
    throw new Error("Invalid production marketing status.");
  }
  const data = value as Record<string, unknown>;
  const result = {} as Record<Key, number>;
  for (const key of fields) {
    const count = data[key];
    if (!Object.hasOwn(data, key) || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("Invalid production marketing status.");
    }
    result[key] = count;
  }
  return result;
}

export const parseRetainedMarketingStatus = (value: unknown) => parseCounts(value, productionMarketingStatusFields);
export const parseDirectMarketingStatus = (value: unknown) => parseCounts(value, directStatusFields);

export function parseProductionMarketingStatus(value: unknown) {
  return value && typeof value === "object" && Object.hasOwn(value, "unresolvedPreferenceHolds")
    ? parseDirectMarketingStatus(value)
    : parseRetainedMarketingStatus(value);
}
