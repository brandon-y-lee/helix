import type { Page, Route } from "@playwright/test";
import type { CartLine, CartState } from "@/lib/cart/types";
import type {
  StorefrontSnapshotProduct,
  StorefrontSnapshotVariant,
} from "@/test-support/storefront-baseline";

function cartProduct(
  product: StorefrontSnapshotProduct,
  variant: StorefrontSnapshotVariant,
): Pick<
  CartLine,
  | "name"
  | "collection"
  | "variantLabel"
  | "price"
  | "swatch"
  | "imageUrl"
  | "imageAlt"
  | "placeholderMedia"
> {
  const presentation = product.media.filter(
    (item) => item.kind !== "video",
  );
  const media =
    presentation.find((item) => item.role === "cart") ??
    presentation.find((item) => item.role === "card_default") ??
    presentation.find((item) => item.role === "card") ??
    presentation.find((item) => item.role === "detail") ??
    presentation.find((item) => item.role === "hero") ??
    null;
  const palette = media?.placeholderPalette;

  return {
    name: product.displayName,
    collection:
      product.routineGroup === "core" ? "The Core" : "Beyond The Core",
    variantLabel: variant.label,
    price: variant.price,
    swatch: [...product.swatch],
    imageUrl: media?.kind === "image" ? media.url : null,
    imageAlt: media?.alt ?? null,
    placeholderMedia:
      media?.kind === "placeholder"
        ? {
            kind: "placeholder",
            alt: media.alt,
            paletteId: media.paletteId,
            palette: {
              start: palette?.start ?? product.swatch[0],
              end: palette?.end ?? product.swatch[1],
              accent: palette?.accent,
              surface: palette?.surface,
              ink: palette?.ink,
              highlight: palette?.highlight,
            },
          }
        : null,
  };
}

function cartState(lines: CartLine[]): CartState {
  return {
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: lines.reduce((sum, line) => sum + line.lineSubtotal, 0),
    currency: "USD",
  };
}

export function createCartLayoutFixture(
  products: readonly StorefrontSnapshotProduct[],
  { lineCount, quantity }: { lineCount: number; quantity: number },
): CartState {
  const productVariants = products.flatMap((product) =>
    product.variants.map((variant) => ({ product, variant })),
  );
  if (lineCount > 0 && productVariants.length === 0) {
    throw new Error("Cart layout fixtures require a governed Product Variant.");
  }

  // Repeat governed presentations only to exercise scroll pressure. Quantity,
  // line identity and availability are browser-controlled; Catalog facts stay
  // bound to the immutable snapshot even when no current Offer is available.
  return cartState(Array.from({ length: lineCount }, (_, index) => {
    const { product, variant } = productVariants[index % productVariants.length];
    return {
      key: `layout:${product.slug}:${variant.id}:${index}`,
      slug: product.slug,
      variantId: variant.id,
      ...cartProduct(product, variant),
      quantity,
      available: true,
      warning: null,
      lineSubtotal: variant.price * quantity,
    };
  }));
}

async function fulfillCart(route: Route, cart: CartState) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(cart),
  });
}

export async function installCartFixture(
  page: Page,
  products: readonly StorefrontSnapshotProduct[],
): Promise<void> {
  // PR CI intentionally has no Supabase service-role key. Keep browser cart
  // behavior deterministic without granting privileged database access to PRs.
  let lines: CartLine[] = [];

  const handleCartRequest = async (route: Route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === "/api/cart" && request.method() === "GET") {
      await fulfillCart(route, cartState(lines));
      return;
    }

    if (pathname === "/api/cart" && request.method() === "DELETE") {
      lines = [];
      await fulfillCart(route, cartState(lines));
      return;
    }

    if (pathname === "/api/cart/items" && request.method() === "POST") {
      const body = request.postDataJSON() as {
        slug?: string;
        variantId?: string;
        quantity?: number;
      };
      const snapshotProduct = body.slug
        ? products.find((product) => product.slug === body.slug)
        : undefined;
      const variant = snapshotProduct?.variants.find(
        (item) => item.id === body.variantId,
      );
      if (!snapshotProduct || !variant || !body.slug || !body.variantId) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unknown cart fixture product" }),
        });
        return;
      }

      const quantity = body.quantity ?? 1;
      const key = `${body.slug}:${body.variantId}`;
      const product = cartProduct(snapshotProduct, variant);
      const existing = lines.find((line) => line.key === key);
      lines = existing
        ? lines.map((line) =>
            line.key === key
              ? {
                  ...line,
                  quantity: line.quantity + quantity,
                  lineSubtotal: line.price * (line.quantity + quantity),
                }
              : line,
          )
        : [
            ...lines,
            {
              key,
              slug: body.slug,
              variantId: body.variantId,
              ...product,
              quantity,
              available: true,
              warning: null,
              lineSubtotal: product.price * quantity,
            },
          ];
      await fulfillCart(route, cartState(lines));
      return;
    }

    await route.fallback();
  };

  await page.route("**/api/cart", handleCartRequest);
  await page.route("**/api/cart/items", handleCartRequest);
}
