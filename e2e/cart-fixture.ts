import type { Page, Route } from "@playwright/test";
import type { CartLine, CartState } from "@/lib/cart/types";

const PRODUCTS: Record<
  string,
  Pick<
    CartLine,
    | "name"
    | "collection"
    | "variantLabel"
    | "price"
    | "swatch"
    | "imageUrl"
    | "imageAlt"
    | "placeholderMedia"
  >
> = {
  "cleanse-01-calming-gel-cleanser": {
    name: "CLEANSE",
    collection: "The Core",
    variantLabel: "200 mL",
    price: 2200,
    swatch: ["#d8d2c8", "#9c9488"],
    imageUrl: null,
    imageAlt: null,
    placeholderMedia: null,
  },
  "treat-03-pdrn-5-ampoule": {
    name: "TREAT",
    collection: "The Core",
    variantLabel: "30 mL",
    price: 2500,
    swatch: ["#d8d2c8", "#9c9488"],
    imageUrl: null,
    imageAlt: null,
    placeholderMedia: null,
  },
};

function cartState(lines: CartLine[]): CartState {
  return {
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: lines.reduce((sum, line) => sum + line.lineSubtotal, 0),
    currency: "USD",
  };
}

async function fulfillCart(route: Route, cart: CartState) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(cart),
  });
}

export async function installCartFixture(page: Page): Promise<void> {
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
      const product = body.slug ? PRODUCTS[body.slug] : undefined;
      if (!product || !body.slug || !body.variantId) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unknown cart fixture product" }),
        });
        return;
      }

      const quantity = body.quantity ?? 1;
      const key = `${body.slug}:${body.variantId}`;
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
