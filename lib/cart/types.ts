export type CartLine = {
  key: string;
  slug: string;
  name: string;
  collection: string;
  variantId: string;
  variantLabel: string;
  price: number;
  swatch: [string, string];
  quantity: number;
  available: boolean;
  warning: string | null;
  lineSubtotal: number;
};

export type CartState = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  currency: "USD";
};

export type CartErrorCode =
  | "invalid_quantity"
  | "missing_product"
  | "unavailable_product"
  | "missing_variant"
  | "cart_unavailable";

export class CartError extends Error {
  code: CartErrorCode;

  constructor(code: CartErrorCode, message: string) {
    super(message);
    this.name = "CartError";
    this.code = code;
  }
}
