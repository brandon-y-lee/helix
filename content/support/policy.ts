export const FREE_STANDARD_SHIPPING_THRESHOLD_CENTS = 5000;

export const shippingPolicy = {
  thresholdCents: FREE_STANDARD_SHIPPING_THRESHOLD_CENTS,
  destinationSummary: "Standard shipping is planned for United States addresses.",
  processingWindow: "2 to 5 business days",
  transitWindow: "3 to 10 business days after carrier pickup",
  trackingWindow: "24 to 48 hours after a package is accepted by the carrier",
};

export const returnsPolicy = {
  returnWindowDays: 30,
  issueReportWindowDays: 7,
  refundProcessingWindow: "1 to 2 weeks after the approved return is received and inspected",
  condition:
    "Eligible items would need to be unopened, unused, and in their original packaging unless a future Item Claim process approved another condition.",
};

export const supportPolicy = {
  contactIntakeConfigured: false,
  contactStatus:
    "No verified public Support Channel has been published for helix.",
  privacyRequestRoute:
    "Use the Contact page to prepare Privacy Request details. The page cannot submit or store a request while Support Intake is unavailable.",
};

export function qualifiesForFreeStandardShipping(subtotalCents: unknown): boolean {
  return (
    typeof subtotalCents === "number" &&
    Number.isFinite(subtotalCents) &&
    subtotalCents >= FREE_STANDARD_SHIPPING_THRESHOLD_CENTS
  );
}

export function remainingForFreeStandardShipping(subtotalCents: unknown): number {
  if (typeof subtotalCents !== "number" || !Number.isFinite(subtotalCents)) {
    return FREE_STANDARD_SHIPPING_THRESHOLD_CENTS;
  }

  return Math.max(0, FREE_STANDARD_SHIPPING_THRESHOLD_CENTS - subtotalCents);
}

export function formatFreeShippingThreshold(): string {
  return "$50+";
}
