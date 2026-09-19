export function hasHelixPaymentMetadata(metadata: Record<string, string> | null | undefined): boolean {
  return !!metadata && ["order_id", "cart_id", "attempt_id", "environment", "schema"].some((key) => key in metadata);
}

/** Empty/missing mutable metadata is never evidence that delayed Helix work is unrelated. */
export function isExplicitlyUnrelatedPaymentMetadata(metadata: Record<string, string> | null | undefined): boolean {
  if (!metadata || typeof metadata.application !== "string" || !metadata.application.trim() ||
    metadata.application.trim().toLowerCase() === "helix") return false;
  return !hasHelixPaymentMetadata(metadata);
}
