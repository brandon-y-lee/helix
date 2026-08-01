import type { PlaceholderPalette } from "@/lib/products";

export type CartPlaceholderMedia = {
  kind: "placeholder";
  alt: string;
  paletteId: string | null;
  palette: PlaceholderPalette;
} | null;

export type CartLine = {
  key: string;
  slug: string;
  name: string;
  collection: string;
  variantId: string;
  variantLabel: string;
  price: number;
  swatch: [string, string];
  imageUrl: string | null;
  imageAlt: string | null;
  placeholderMedia: CartPlaceholderMedia;
  quantity: number;
  available: boolean;
  warning: string | null;
  lineSubtotal: number;
};

export type CartAddInput = Pick<
  CartLine,
  | "slug"
  | "name"
  | "variantId"
  | "variantLabel"
  | "price"
  | "swatch"
  | "imageUrl"
  | "imageAlt"
  | "placeholderMedia"
>;

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
