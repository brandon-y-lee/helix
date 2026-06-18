import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CartError, type CartLine, type CartState } from "@/lib/cart/types";
import { normalizeCartQuantity } from "@/lib/cart/validation";

export const GUEST_CART_COOKIE = "mei_pelle_guest_cart";
const MAX_LINE_QUANTITY = 99;
const GUEST_CART_DAYS = 60;

type CartRow = {
  id: string;
  user_id: string | null;
  guest_token_hash: string | null;
  status: "active" | "merged" | "abandoned";
};

type VariantRow = {
  variant_key: string;
  label: string;
  price_cents: number;
  position: number;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  collection: string;
  status: string;
  swatch_from: string;
  swatch_to: string;
  product_variants: VariantRow[] | null;
};

type CartItemRow = {
  id: string;
  product_id: string;
  variant_key: string;
  quantity: number;
  products: ProductRow | ProductRow[] | null;
};

type CatalogProductRow = ProductRow;

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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function getGuestToken(create: boolean): Promise<string | null> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(GUEST_CART_COOKIE)?.value;
  if (existing) return existing;
  if (!create) return null;

  const token = newGuestToken();
  cookieStore.set(GUEST_CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_CART_DAYS * 24 * 60 * 60,
  });
  return token;
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

  if (userId) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("carts")
      .select("id, user_id, guest_token_hash, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw new Error(`[cart] Failed to load user cart: ${error.message}`);
    if (data || !create) return data as CartRow | null;

    const { data: inserted, error: insertError } = await admin
      .from("carts")
      .insert({ user_id: userId, status: "active" })
      .select("id, user_id, guest_token_hash, status")
      .single();

    if (insertError) throw new Error(`[cart] Failed to create user cart: ${insertError.message}`);
    return inserted as CartRow;
  }

  const token = await getGuestToken(create);
  if (!token) return null;
  const tokenHash = hashGuestToken(token);
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("carts")
    .select("id, user_id, guest_token_hash, status")
    .eq("guest_token_hash", tokenHash)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(`[cart] Failed to load guest cart: ${error.message}`);
  if (data || !create) return data as CartRow | null;

  const expiresAt = new Date(Date.now() + GUEST_CART_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: inserted, error: insertError } = await admin
    .from("carts")
    .insert({
      guest_token_hash: tokenHash,
      status: "active",
      expires_at: expiresAt,
    })
    .select("id, user_id, guest_token_hash, status")
    .single();

  if (insertError) throw new Error(`[cart] Failed to create guest cart: ${insertError.message}`);
  return inserted as CartRow;
}

function firstProduct(value: ProductRow | ProductRow[] | null): ProductRow | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function mapLine(row: CartItemRow): CartLine {
  const product = firstProduct(row.products);
  const variant = product?.product_variants?.find((v) => v.variant_key === row.variant_key);
  const available = Boolean(product && variant && product.status === "available");
  const price = variant?.price_cents ?? 0;
  const warning = !product
    ? "This product is no longer available."
    : !variant
      ? "This variant is no longer available."
      : product.status !== "available"
        ? "This product is not currently available."
        : null;

  return {
    key: row.id,
    slug: product?.slug ?? "",
    name: product?.name ?? "Unavailable product",
    collection: product?.collection ?? "",
    variantId: row.variant_key,
    variantLabel: variant?.label ?? row.variant_key,
    price,
    swatch: [product?.swatch_from ?? "#d8d2c8", product?.swatch_to ?? "#9c9488"],
    quantity: row.quantity,
    available,
    warning,
    lineSubtotal: available ? price * row.quantity : 0,
  };
}

async function readCart(cartId: string): Promise<CartState> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("cart_items")
    .select(
      "id, product_id, variant_key, quantity, products ( id, slug, name, collection, status, swatch_from, swatch_to, product_variants ( variant_key, label, price_cents, position ) )",
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

async function getCatalogProduct(slug: string, variantKey: string): Promise<{
  product: CatalogProductRow;
  variant: VariantRow;
}> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("products")
    .select(
      "id, slug, name, collection, status, swatch_from, swatch_to, product_variants!inner ( variant_key, label, price_cents, position )",
    )
    .eq("slug", slug)
    .eq("product_variants.variant_key", variantKey)
    .maybeSingle();

  if (error) throw new Error(`[cart] Failed to validate product: ${error.message}`);
  if (!data) throw new CartError("missing_variant", "Choose an available product variant.");

  const product = data as unknown as CatalogProductRow;
  const variant = product.product_variants?.find((v) => v.variant_key === variantKey);
  if (!variant) throw new CartError("missing_variant", "Choose an available product variant.");
  if (product.status !== "available") {
    throw new CartError("unavailable_product", "This product is not currently available.");
  }

  return { product, variant };
}

export async function getCartState(): Promise<CartState> {
  const cart = await getOrCreateActiveCart(false);
  if (!cart) return emptyCart();
  return readCart(cart.id);
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
  const { data: existing, error: existingError } = await admin
    .from("cart_items")
    .select("id, quantity")
    .eq("cart_id", cart.id)
    .eq("product_id", product.id)
    .eq("variant_key", variant.variant_key)
    .maybeSingle();

  if (existingError) throw new Error(`[cart] Failed to inspect cart line: ${existingError.message}`);

  if (existing) {
    const nextQuantity = Math.min(MAX_LINE_QUANTITY, Number(existing.quantity) + quantity);
    const { error } = await admin
      .from("cart_items")
      .update({ quantity: nextQuantity })
      .eq("id", existing.id);
    if (error) throw new Error(`[cart] Failed to update cart line: ${error.message}`);
  } else {
    const { error } = await admin.from("cart_items").insert({
      cart_id: cart.id,
      product_id: product.id,
      variant_key: variant.variant_key,
      quantity,
    });
    if (error) throw new Error(`[cart] Failed to add cart line: ${error.message}`);
  }

  return readCart(cart.id);
}

export async function setCartItemQuantity(lineId: string, quantity: number): Promise<CartState> {
  if (!lineId) throw new CartError("cart_unavailable", "Cart line is unavailable.");
  if (quantity <= 0) return removeCartItem(lineId);

  const nextQuantity = normalizeCartQuantity(quantity);
  const cart = await getOrCreateActiveCart(false);
  if (!cart) return emptyCart();

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("cart_items")
    .update({ quantity: nextQuantity })
    .eq("id", lineId)
    .eq("cart_id", cart.id);

  if (error) throw new Error(`[cart] Failed to set cart quantity: ${error.message}`);
  return readCart(cart.id);
}

export async function removeCartItem(lineId: string): Promise<CartState> {
  if (!lineId) throw new CartError("cart_unavailable", "Cart line is unavailable.");
  const cart = await getOrCreateActiveCart(false);
  if (!cart) return emptyCart();

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("cart_items")
    .delete()
    .eq("id", lineId)
    .eq("cart_id", cart.id);

  if (error) throw new Error(`[cart] Failed to remove cart line: ${error.message}`);
  return readCart(cart.id);
}

export async function clearCart(): Promise<CartState> {
  const cart = await getOrCreateActiveCart(false);
  if (!cart) return emptyCart();

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("cart_items").delete().eq("cart_id", cart.id);
  if (error) throw new Error(`[cart] Failed to clear cart: ${error.message}`);
  return emptyCart();
}

export async function mergeGuestCartIntoCurrentUser(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_CART_COOKIE)?.value;
  if (!token) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.rpc("merge_guest_cart", {
    p_guest_token_hash: hashGuestToken(token),
  });
  if (error) throw new Error(`[cart] Failed to merge guest cart: ${error.message}`);

  await clearGuestToken();
}
