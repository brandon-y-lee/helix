export class PaymentOperationsError extends Error {
  constructor(
    readonly code: "invalid_request" | "replay_conflict" | "operations_unavailable",
    readonly status: number,
  ) {
    super(
      code === "invalid_request"
        ? "Choose one payment event, its current version, and a reason."
        : code === "replay_conflict"
          ? "This event changed or is not eligible. Refresh and inspect it again."
          : "Payment operations are temporarily unavailable.",
    );
    this.name = "PaymentOperationsError";
  }
}
