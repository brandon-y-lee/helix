import type { ProductStatus } from "@/lib/products";

/** Badge text for non-available states (null when the product is available). */
export function statusLabel(status: ProductStatus): string | null {
  switch (status) {
    case "coming_soon":
      return "Coming soon";
    case "sold_out":
      return "Sold out";
    case "waitlist":
      return "Waitlist";
    default:
      return null;
  }
}
