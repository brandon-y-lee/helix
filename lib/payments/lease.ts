import "server-only";

export class PaymentLeaseLostError extends Error {
  constructor() {
    super("Payment processing lease is no longer current.");
    this.name = "PaymentLeaseLostError";
  }
}
