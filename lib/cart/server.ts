import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getCurrentIdentity } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CartError, type CartLine, type CartState } from "@/lib/cart/types";
import { normalizeCartQuantity } from "@/lib/cart/validation";
import { routineGroupLabel } from "@/lib/catalog/product-routine";

export const GUEST_CART_COOKIE = "mei_pelle_guest_cart";
const GUEST_CART_DAYS = 60;

type CartRow = {
  id: string;
  user_id: string | null;
  guest_token_hash: string | null;
  status: "active" | "merged" | "abandoned";
};

type ResolvedCartRow = {
  cart_id: string | null;
  user_id: string | null;
  guest_token_hash: string | null;
  status: "active" | "merged" | "abandoned";
  expired: boolean;
};

type VariantRow = {
  variant_key: string;
  label: string;
  price_cents: number;
  sku: string | null;
  available: boolean;
  inventory_status: "in_stock" | "low_stock" | "out_of_stock" | "unavailable";
};

type ProductRow = {
  id: string;
  slug: string;
  display_name: string;
  formal_title: string;
  routine_group: "core" | "beyond_core";
  status: string;
  catalog_status: string;
  swatch_from: string;
  swatch_to: string;
  product_variants: VariantRow[] | null;
  product_media: MediaRow[] | null;
};

type MediaRow = {
  media_type: string;
  url: string | null;
  alt: string;
  role: string;
  sort_order: number;
  palette_id: string | null;
  placeholder_palette: Record<string, string> | null;
};

type CartItemRow = {
  id: string;
  product_id: string;
  variant_key: string;
  quantity: number;
  products: ProductRow | ProductRow[] | null;
};

type CatalogProductRow = ProductRow;

export type CheckoutCartLine = CartLine & {
  productId: string;
  productName: string;
  variantSku: string | null;
  productSnapshot: Record<string, unknown>;
};

export type CheckoutCartSnapshot = {
  cartId: string;
  checkoutGeneration: string;
  userId: string | null;
  userEmail: string | null;
  lines: CheckoutCartLine[];
  count: number;
  subtotal: number;
  currency: "USD";
};

function emptyCart(): CartState {
  return { lines: [], count: 0, subtotal: 0, currency: "USD" };
}

function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

async function getUserId(): Promise<string | null> {
  return (await getCurrentIdentity())?.id ?? null;
}

async function getUserIdentity(): Promise<{ userId: string | null; email: string | null }> {
  const identity = await getCurrentIdentity();
  return {
    userId: identity?.id ?? null,
    email: identity?.email ?? null,
  };
}

async function getGuestToken(create: boolean): Promise<string | null> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(GUEST_CART_COOKIE)?.value;
  if (existing) return existing;
  if (!create) return null;

  const token = newGuestToken();
  await setGuestToken(token);
  return token;
}

async function setGuestToken(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(GUEST_CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_CART_DAYS * 24 * 60 * 60,
  });
}

async function clearGuestToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(GUEST_CART_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

async function getOrCreateActiveCart(create: boolean): Promise<CartRow | null> {
  const userId = await getUserId();
  const admin = createSupabaseAdminClient();

  if (userId) {
    const { data, error } = await admin.rpc("resolve_active_cart", {
      p_user_id: userId,
      p_guest_token_hash: null,
      p_create: create,
    });
    if (error) throw new Error(`[cart] Failed to resolve user cart: ${error.message}`);
    const resolved = (data as ResolvedCartRow[] | null)?.[0] ?? null;
    return resolved?.cart_id
      ? {
          id: resolved.cart_id,
          user_id: resolved.user_id,
          guest_token_hash: resolved.guest_token_hash,
          status: resolved.status,
        }
      : null;
  }

  const token = await getGuestToken(create);
  if (!token) return null;
  const tokenHash = hashGuestToken(token);
  const { data, error } = await admin.rpc("resolve_active_cart", {
    p_user_id: null,
    p_guest_token_hash: tokenHash,
    p_create: create,
  });
  if (error) throw new Error(`[cart] Failed to resolve guest cart: ${error.message}`);
  const resolved = (data as ResolvedCartRow[] | null)?.[0] ?? null;

  if (resolved?.expired) {
    await clearGuestToken();
    if (!create) return null;

    const replacementToken = newGuestToken();
    await setGuestToken(replacementToken);
    const { data: replacementData, error: replacementError } = await admin.rpc(
      "resolve_active_cart",
      {
        p_user_id: null,
        p_guest_token_hash: hashGuestToken(replacementToken),
        p_create: true,
      },
    );
    if (replacementError) {
      throw new Error(`[cart] Failed to replace expired guest cart: ${replacementError.message}`);
    }
    const replacement =
      (replacementData as ResolvedCartRow[] | null)?.[0] ?? null;
    if (!replacement?.cart_id) return null;
    return {
      id: replacement.cart_id,
      user_id: replacement.user_id,
      guest_token_hash: replacement.guest_token_hash,
      status: replacement.status,
    };
  }

  return resolved?.cart_id
    ? {
        id: resolved.cart_id,
        user_id: resolved.user_id,
        guest_token_hash: resolved.guest_token_hash,
        status: resolved.status,
      }
    : null;
}

function firstProduct(value: ProductRow | ProductRow[] | null): ProductRow | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function placeholderMedia(media: MediaRow | undefined, swatch: [string, string]) {
  if (!media || media.media_type !== "image" || media.url) return null;
  const palette = media.placeholder_palette ?? {};
  return {
    kind: "placeholder" as const,
    alt: media.alt,
    paletteId: media.palette_id ?? null,
    palette: {
      start: isHex(palette.start) ? palette.start : swatch[0],
      end: isHex(palette.end) ? palette.end : swatch[1],
      accent: isHex(palette.accent) ? palette.accent : undefined,
      surface: isHex(palette.surface) ? palette.surface : undefined,
      ink: isHex(palette.ink) ? palette.ink : undefined,
      highlight: isHex(palette.highlight) ? palette.highlight : undefined,
    },
  };
}

function mapLine(row: CartItemRow): CartLine {
  const product = firstProduct(row.products);
  const variant = product?.product_variants?.find((v) => v.variant_key === row.variant_key);
  const available = Boolean(
    product &&
      variant &&
      product.catalog_status === "active" &&
      product.status === "available" &&
      variant.available &&
      variant.inventory_status !== "out_of_stock" &&
      variant.inventory_status !== "unavailable",
  );
  const price = variant?.price_cents ?? 0;
  const swatch: [string, string] = [
    product?.swatch_from ?? "#d8d2c8",
    product?.swatch_to ?? "#9c9488",
  ];
  const media = product?.product_media
    ?.filter(
      (item) =>
        item.media_type !== "video" &&
        [
          "cart",
          "card_default",
          "card",
          "detail",
          "hero",
          "gallery",
          "search",
        ].includes(item.role),
    )
    ?.slice()
    .sort((a, b) => {
      const roleA = a.role === "cart" ? -2 : a.role === "card_default" || a.role === "card" ? -1 : 1;
      const roleB = b.role === "cart" ? -2 : b.role === "card_default" || b.role === "card" ? -1 : 1;
      return roleA - roleB || a.sort_order - b.sort_order;
    })[0];
  const warning = !product
    ? "This product is no longer available."
    : !variant
      ? "This variant is no longer available."
      : product.catalog_status !== "active"
        ? "This product is no longer available."
        : product.status !== "available"
        ? "This product is not currently available."
        : !variant.available ||
            variant.inventory_status === "out_of_stock" ||
            variant.inventory_status === "unavailable"
          ? "This variant is no longer available."
        : null;

  return {
    key: row.id,
    slug: product?.slug ?? "",
    name: product?.display_name ?? "Unavailable product",
    collection: product ? routineGroupLabel(product.routine_group) : "",
    variantId: row.variant_key,
    variantLabel: variant?.label ?? row.variant_key,
    price,
    swatch,
    imageUrl: media?.media_type === "image" ? media.url : null,
    imageAlt: media?.alt ?? null,
    placeholderMedia: placeholderMedia(media, swatch),
    quantity: row.quantity,
    available,
    warning,
    lineSubtotal: available ? price * row.quantity : 0,
  };
}

function mapCheckoutLine(row: CartItemRow): CheckoutCartLine {
  const line = mapLine(row);
  const product = firstProduct(row.products);
  const variant = product?.product_variants?.find((v) => v.variant_key === row.variant_key);

  return {
    ...line,
    productId: row.product_id,
    productName: product?.formal_title ?? line.name,
    variantSku: variant?.sku ?? null,
    productSnapshot: {
      productId: row.product_id,
      slug: product?.slug ?? line.slug,
      displayName: product?.display_name ?? line.name,
      productName: product?.formal_title ?? line.name,
      collection: product ? routineGroupLabel(product.routine_group) : line.collection,
      variantKey: row.variant_key,
      variantLabel: variant?.label ?? line.variantLabel,
      variantSku: variant?.sku ?? null,
      priceCents: variant?.price_cents ?? line.price,
      swatchFrom: product?.swatch_from ?? line.swatch[0],
      swatchTo: product?.swatch_to ?? line.swatch[1],
      imageUrl: line.imageUrl,
      imageAlt: line.imageAlt,
      placeholderMedia: line.placeholderMedia,
    },
  };
}

async function readCart(cartId: string): Promise<CartState> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("cart_items")
    .select(
      "id, product_id, variant_key, quantity, products ( id, slug, display_name, formal_title, routine_group, status, catalog_status, swatch_from, swatch_to, product_variants ( variant_key, label, price_cents, sort_order, sku, available, inventory_status ), product_media ( media_type, url, alt, role, sort_order, palette_id, placeholder_palette ) )",
    )
    .eq("cart_id", cartId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`[cart] Failed to read cart items: ${error.message}`);

  const lines = (data as unknown as CartItemRow[]).map(mapLine);
  return {
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: lines.reduce((sum, line) => sum + line.lineSubtotal, 0),
    currency: "USD",
  };
}

async function readCheckoutCart(
  cartId: string,
): Promise<Omit<CheckoutCartSnapshot, "cartId" | "checkoutGeneration" | "userId" | "userEmail">> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("cart_items")
    .select(
      "id, product_id, variant_key, quantity, products ( id, slug, display_name, formal_title, routine_group, status, catalog_status, swatch_from, swatch_to, product_variants ( variant_key, label, price_cents, sort_order, sku, available, inventory_status ), product_media ( media_type, url, alt, role, sort_order, palette_id, placeholder_palette ) )",
    )
    .eq("cart_id", cartId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`[cart] Failed to read checkout cart items: ${error.message}`);

  const lines = (data as unknown as CartItemRow[]).map(mapCheckoutLine);
  return {
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: lines.reduce((sum, line) => sum + line.lineSubtotal, 0),
    currency: "USD",
  };
}

async function getCatalogProduct(slug: string, variantKey: string): Promise<{
  product: CatalogProductRow;
  variant: VariantRow;
}> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("products")
    .select(
      "id, slug, display_name, formal_title, routine_group, status, catalog_status, swatch_from, swatch_to, product_variants!inner ( variant_key, label, price_cents, sort_order, sku, available, inventory_status ), product_media ( media_type, url, alt, role, sort_order, palette_id, placeholder_palette )",
    )
    .eq("slug", slug)
    .eq("catalog_status", "active")
    .eq("product_variants.variant_key", variantKey)
    .eq("product_variants.available", true)
    .maybeSingle();

  if (error) throw new Error(`[cart] Failed to validate product: ${error.message}`);
  if (!data) throw new CartError("missing_variant", "Choose an available product variant.");

  const product = data as unknown as CatalogProductRow;
  const variant = product.product_variants?.find((v) => v.variant_key === variantKey);
  if (!variant) throw new CartError("missing_variant", "Choose an available product variant.");
  if (product.status !== "available") {
    throw new CartError("unavailable_product", "This product is not currently available.");
  }
  if (
    !variant.available ||
    variant.inventory_status === "out_of_stock" ||
    variant.inventory_status === "unavailable"
  ) {
    throw new CartError("missing_variant", "Choose an available product variant.");
  }

  return { product, variant };
}

export async function getCartState(): Promise<CartState> {
  const cart = await getOrCreateActiveCart(false);
  if (!cart) return emptyCart();
  return readCart(cart.id);
}

export async function getCheckoutCartSnapshot(): Promise<CheckoutCartSnapshot> {
  const [cart, identity] = await Promise.all([getOrCreateActiveCart(false), getUserIdentity()]);
  if (!cart) throw new CartError("cart_unavailable", "Add an available item before checkout.");

  const admin = createSupabaseAdminClient();
  const [snapshot, generationResult] = await Promise.all([
    readCheckoutCart(cart.id),
    admin
      .from("carts")
      .select("checkout_generation")
      .eq("id", cart.id)
      .single(),
  ]);
  if (generationResult.error) {
    throw new Error(`[cart] Failed to read checkout generation: ${generationResult.error.message}`);
  }

  return {
    cartId: cart.id,
    checkoutGeneration: generationResult.data.checkout_generation,
    userId: identity.userId,
    userEmail: identity.email,
    ...snapshot,
  };
}

export async function getActiveCartIdentity(): Promise<{
  cartId: string | null;
  userId: string | null;
}> {
  const [cart, identity] = await Promise.all([getOrCreateActiveCart(false), getUserIdentity()]);
  return {
    cartId: cart?.id ?? null,
    userId: identity.userId,
  };
}

export async function addCartItem(input: {
  slug: string;
  variantId: string;
  quantity?: number;
}): Promise<CartState> {
  const quantity = normalizeCartQuantity(input.quantity ?? 1);
  const { product, variant } = await getCatalogProduct(input.slug, input.variantId);
  const cart = await getOrCreateActiveCart(true);
  if (!cart) throw new CartError("cart_unavailable", "Cart is unavailable.");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("cart_add_item_delta", {
    p_cart_id: cart.id,
    p_product_id: product.id,
    p_variant_key: variant.variant_key,
    p_quantity_delta: quantity,
  });
  if (error) throw new Error(`[cart] Failed to add cart line: ${error.message}`);

  return readCart(cart.id);
}

export async function setCartItemQuantity(lineId: string, quantity: number): Promise<CartState> {
  if (!lineId) throw new CartError("cart_unavailable", "Cart line is unavailable.");
  if (quantity <= 0) return removeCartItem(lineId);

  const nextQuantity = normalizeCartQuantity(quantity);
  const cart = await getOrCreateActiveCart(false);
  if (!cart) return emptyCart();

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("cart_set_item_quantity", {
    p_cart_id: cart.id,
    p_line_id: lineId,
    p_quantity: nextQuantity,
  });

  if (error) throw new Error(`[cart] Failed to set cart quantity: ${error.message}`);
  return readCart(cart.id);
}

export async function removeCartItem(lineId: string): Promise<CartState> {
  if (!lineId) throw new CartError("cart_unavailable", "Cart line is unavailable.");
  const cart = await getOrCreateActiveCart(false);
  if (!cart) return emptyCart();

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("cart_remove_item", {
    p_cart_id: cart.id,
    p_line_id: lineId,
  });

  if (error) throw new Error(`[cart] Failed to remove cart line: ${error.message}`);
  return readCart(cart.id);
}

export async function clearCart(): Promise<CartState> {
  const cart = await getOrCreateActiveCart(false);
  if (!cart) return emptyCart();

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("cart_clear_items", { p_cart_id: cart.id });
  if (error) throw new Error(`[cart] Failed to clear cart: ${error.message}`);
  return emptyCart();
}

export async function mergeGuestCartIntoCurrentUser(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_CART_COOKIE)?.value;
  if (!token) return;

  const identity = await getCurrentIdentity();
  if (!identity) return;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("merge_guest_cart", {
    p_user_id: identity.id,
    p_guest_token_hash: hashGuestToken(token),
  });
  if (error) throw new Error(`[cart] Failed to merge guest cart: ${error.message}`);

  await clearGuestToken();
}
