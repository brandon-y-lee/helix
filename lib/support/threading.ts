/** Restrict threading headers to bounded, single RFC Message-ID tokens. */
export function supportRfcMessageId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 512
    && /^<[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?>$/.test(value);
}
