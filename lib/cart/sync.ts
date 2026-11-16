import {
  CART_CHANGE_CHANNEL,
  CART_IDENTITY_CHANGED_COOKIE,
} from "@/lib/customer-state-identifiers";

export { CART_CHANGE_CHANNEL, CART_IDENTITY_CHANGED_COOKIE };

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
