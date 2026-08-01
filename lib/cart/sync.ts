export const CART_CHANGE_CHANNEL = "mei-pelle-cart";
export const CART_IDENTITY_CHANGED_COOKIE = "mei_pelle_cart_identity_changed";

export type CartChangeMessage = { type: "cart-changed" };

let cartChangeChannel: BroadcastChannel | null = null;

export function getCartChangeChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  cartChangeChannel ??= new BroadcastChannel(CART_CHANGE_CHANNEL);
  return cartChangeChannel;
}

export function releaseCartChangeChannel(channel: BroadcastChannel): void {
  if (cartChangeChannel !== channel) return;
  channel.close();
  cartChangeChannel = null;
}

export function isCartChangeMessage(value: unknown): value is CartChangeMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as CartChangeMessage).type === "cart-changed",
  );
}

export function broadcastCartChanged(): void {
  getCartChangeChannel()?.postMessage(
    { type: "cart-changed" } satisfies CartChangeMessage,
  );
}
