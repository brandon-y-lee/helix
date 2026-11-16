import { isControlledPublicSiteOrigin } from "@/lib/site-url";

type ReturnDestinations = { id: string; success_url?: string | null; cancel_url?: string | null };

// Provider return URLs are immutable and deliberately absent from the strict
// refresh cache. Only a fresh provider object can prove a payable link is local.
export function checkoutReturnDestinationState(
  session: ReturnDestinations,
  origin: string,
): "match" | "origin_changed" | "invalid" {
  try {
    const parse = (value: string | null | undefined) => {
      if (!value || value !== value.trim()) throw new Error("Missing return destination");
      const url = new URL(value);
      if (url.username || url.password || url.hash ||
          (url.origin !== origin && !isControlledPublicSiteOrigin(url.origin))) throw new Error("Invalid return destination");
      return url;
    };
    const success = parse(session.success_url);
    const cancel = parse(session.cancel_url);
    const successId = success.searchParams.get("session_id");
    if (success.pathname !== "/checkout/success" || [...success.searchParams].length !== 1 ||
        (successId !== "{CHECKOUT_SESSION_ID}" && successId !== session.id) ||
        cancel.pathname !== "/cart" || [...cancel.searchParams].length !== 1 ||
        cancel.searchParams.get("checkout") !== "cancelled") return "invalid";
    return success.origin === origin && cancel.origin === origin ? "match" : "origin_changed";
  } catch {
    return "invalid";
  }
}
