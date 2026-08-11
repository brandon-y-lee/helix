import { describe, expect, it, vi } from "vitest";
import type {
  StorefrontSnapshot,
  StorefrontSnapshotProduct,
} from "@/test-support/storefront-baseline";
import { reconcileStorefrontSnapshot } from "@/test-support/storefront-reconciliation";
import { createStorefrontJourneys } from "@/test-support/storefront-journeys";
import {
  productOfferPresentation,
  productPurchaseCta,
} from "@/lib/products";

function product(
  overrides: Partial<StorefrontSnapshotProduct> = {},
): StorefrontSnapshotProduct {
  return {
    id: "core-id",
    slug: "core-product",
    path: "/products/core-product",
    displayName: "CORE",
    productType: "Cleanser",
    badge: null,
    currency: "USD",
    catalogStatus: "active",
    merchandisingStatus: "available",
    editorialDescription: "Public description.",
    swatch: ["#112233", "#445566"],
    sortOrder: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    publishedAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    madeFor: null,
    goodFor: null,
    texture: null,
    keyIngredients: [],
    ingredients: null,
    concerns: [],
    usageTime: [],
    searchKeywords: [],
    routineGroup: "core",
    systemPosition: 1,
    systemStepName: "CLEANSE",
    routineSort: 10,
    familyId: null,
    familyIsEntry: null,
    variants: [
      {
        id: "standard",
        label: "Standard",
        price: 2200,
        available: true,
        inventoryStatus: "in_stock",
        sortOrder: 0,
      },
    ],
    media: [
      {
        kind: "video",
        url: "/media/routine.mp4",
        alt: "Routine video",
        width: null,
        height: null,
        role: "routine_video",
        sortOrder: 0,
        paletteId: null,
        placeholderPalette: null,
      },
      {
        kind: "image",
        url: "/media/poster.webp",
        alt: "Routine poster",
        width: 1200,
        height: 1600,
        role: "routine_video_poster",
        sortOrder: 1,
        paletteId: null,
        placeholderPalette: null,
      },
      {
        kind: "image",
        url: "/media/core.webp",
        alt: "Core bottle",
        width: 1200,
        height: 1600,
        role: "gallery",
        sortOrder: 2,
        paletteId: null,
        placeholderPalette: null,
      },
    ],
    offer: {
      variantId: "standard",
      label: "Standard",
      price: 2200,
      currency: "USD",
    },
    ...overrides,
  };
}

const core = product();
const beyond = product({
  id: "beyond-id",
  slug: "beyond-product",
  path: "/products/beyond-product",
  displayName: "BEYOND",
  routineGroup: "beyond_core",
  systemPosition: 4,
  systemStepName: "FRAME",
  routineSort: 20,
  sortOrder: 20,
  variants: [],
  media: [],
  offer: null,
});
const waitlist = product({
  id: "waitlist-id",
  slug: "mineral-guard",
  path: "/products/mineral-guard",
  displayName: "Mineral Guard",
  productType: "Mineral facial sunscreen",
  merchandisingStatus: "waitlist",
  routineGroup: "beyond_core",
  systemPosition: 6,
  systemStepName: "PROTECT",
  routineSort: 30,
  sortOrder: 30,
  variants: [],
  media: [],
  offer: null,
});

const snapshot = {
  schemaVersion: 1,
  products: [core, beyond, waitlist],
  routineComplements: [],
  journeys: {
    coreProductId: core.id,
    beyondCoreProductId: beyond.id,
    purchasableProductId: core.id,
    richPdpProductId: core.id,
    searchableProductId: core.id,
  },
} as const satisfies StorefrontSnapshot;

function collectionHtml(products: readonly StorefrontSnapshotProduct[]) {
  return `<!doctype html><html><body>
    <span class="product-count">${products.length} ${products.length === 1 ? "product" : "products"}</span>
    <ul>${products.map((item) => {
      const presentation = productOfferPresentation(item.variants);
      const startingPrice = presentation.showPrice
        ? Math.min(...presentation.offers.map((variant) => variant.price))
        : null;
      const price = item.merchandisingStatus === "waitlist"
        ? "Waitlist"
        : startingPrice === null
          ? null
          : `${presentation.hasMultipleOffers ? "From " : ""}$${(startingPrice / 100).toFixed(2)}`;
      const selectedVariant = item.offer
        ? item.variants.find((variant) => variant.id === item.offer?.variantId)
        : item.variants[0];
      const buyLabel = productPurchaseCta(
        {
          displayName: item.displayName,
          status: item.merchandisingStatus,
          variants: item.variants,
        },
        selectedVariant,
      ).label;
      return `
      <li data-product-card-slug="${item.slug}">
        <span class="product-card__name">${item.displayName}</span>
        ${price === null ? "" : `<span class="product-card__price">${price}</span>`}
        ${item.merchandisingStatus === "waitlist" ? "" : `<button class="product-card__quick-trigger">${buyLabel}</button>`}
      </li>`;
    }).join("")}
    </ul>
  </body></html>`;
}

function pdpHtml(item: StorefrontSnapshotProduct) {
  const presentation = productOfferPresentation(item.variants);
  const initialVariant = presentation.offers[0] ?? item.variants[0];
  const price = presentation.showPrice && initialVariant
    ? `<p class="pdp__price">$${(initialVariant.price / 100).toFixed(2)}</p>`
    : "";
  const options = presentation.showVariantOptions
    ? presentation.offers.map((variant) => `<button>${variant.label}</button>`).join("")
    : "";
  const buyLabel = productPurchaseCta(
    {
      displayName: item.displayName,
      status: item.merchandisingStatus,
      variants: item.variants,
    },
    initialVariant,
  ).label;
  return `<!doctype html><html><body>
    <h1>${item.displayName}</h1>
    ${price}
    <div class="variant-options">${options}</div>
    <button data-pdp-buy-button>${buyLabel}</button>
    <section aria-label="${item.displayName} routine video"></section>
    ${item.media.filter((media) => media.role === "gallery").map((media, index) => `<button data-pdp-media-thumbnail aria-label="View ${media.alt}, media ${index + 1} of 1"></button>`).join("")}
  </body></html>`;
}

describe("Storefront snapshot reconciliation", () => {
  it("keeps the snapshot fixed while the rendered Storefront cache converges", async () => {
    let shopReads = 0;
    let now = 0;
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname === "/collections/shop") {
        shopReads += 1;
        return new Response(
          collectionHtml(shopReads === 1 ? [core] : snapshot.products),
          { status: 200 },
        );
      }
      if (pathname === "/collections/core") {
        return new Response(collectionHtml([core]), { status: 200 });
      }
      if (pathname === "/collections/beyond-the-core") {
        return new Response(collectionHtml([beyond, waitlist]), { status: 200 });
      }
      if (pathname === core.path) {
        return new Response(pdpHtml(core), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    await expect(
      reconcileStorefrontSnapshot(snapshot, {
        baseURL: "http://127.0.0.1:3000",
        fetch,
        now: () => now,
        sleep: async (milliseconds) => {
          now += milliseconds;
        },
      }),
    ).resolves.toBeUndefined();

    expect(shopReads).toBe(2);
    expect(snapshot.products).toEqual([core, beyond, waitlist]);
  });

  it("fails after 15 seconds with a cache-reconciliation rerun diagnostic", async () => {
    let now = 0;
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname === "/collections/shop") {
        return new Response(collectionHtml([core]), { status: 200 });
      }
      if (pathname === "/collections/core") {
        return new Response(collectionHtml([core]), { status: 200 });
      }
      if (pathname === "/collections/beyond-the-core") {
        return new Response(collectionHtml([beyond, waitlist]), { status: 200 });
      }
      if (pathname === core.path) {
        return new Response(pdpHtml(core), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    await expect(
      reconcileStorefrontSnapshot(snapshot, {
        baseURL: "http://127.0.0.1:3000",
        fetch,
        now: () => now,
        sleep: async (milliseconds) => {
          now += milliseconds;
        },
      }),
    ).rejects.toThrow(
      /\[storefront-baseline:cache-reconciliation\].*within 15s.*\/collections\/shop Product order.*rerun.*Catalog changed after snapshot creation/i,
    );

    expect(now).toBe(15_000);
  });
});

describe("Storefront journey expectations", () => {
  it("collapses Product Family siblings only on collection journeys", () => {
    const familyEntry = product({
      id: "family-entry-id",
      slug: "family-entry",
      path: "/products/family-entry",
      familyId: "family-id",
      familyIsEntry: true,
    });
    const familySibling = product({
      id: "family-sibling-id",
      slug: "family-sibling",
      path: "/products/family-sibling",
      familyId: "family-id",
      familyIsEntry: false,
    });
    const familySnapshot = {
      ...snapshot,
      products: [familyEntry, familySibling, beyond, waitlist],
      journeys: {
        ...snapshot.journeys,
        coreProductId: familyEntry.id,
        purchasableProductId: familyEntry.id,
        richPdpProductId: familyEntry.id,
        searchableProductId: familySibling.id,
      },
    } as const satisfies StorefrontSnapshot;
    const journeys = createStorefrontJourneys(familySnapshot);

    expect(journeys.products().map((item) => item.slug)).toEqual([
      "family-entry",
      "beyond-product",
      "mineral-guard",
    ]);
    expect(journeys.productAtPath(familySibling.path)).toBe(familySibling);
    expect(journeys.product("searchable")).toBe(familySibling);
  });

  it("uses the selected production Product Offer without assuming one Product Variant", () => {
    const multiVariantProduct = product({
      variants: [
        {
          id: "travel",
          label: "Travel",
          price: 1200,
          available: false,
          inventoryStatus: "out_of_stock",
          sortOrder: 0,
        },
        {
          id: "standard",
          label: "Standard",
          price: 2400,
          available: true,
          inventoryStatus: "in_stock",
          sortOrder: 1,
        },
      ],
      offer: {
        variantId: "standard",
        label: "Standard",
        price: 2400,
        currency: "USD",
      },
      media: [
        ...core.media,
        {
          kind: "image",
          url: "/media/detail.webp",
          alt: "Core detail",
          width: 1200,
          height: 1600,
          role: "detail",
          sortOrder: 1,
          paletteId: null,
          placeholderPalette: null,
        },
        {
          kind: "video",
          url: "/media/gallery-motion.mp4",
          alt: "Core motion",
          width: null,
          height: null,
          role: "gallery",
          sortOrder: 3,
          paletteId: null,
          placeholderPalette: null,
        },
      ],
    });
    const liveSnapshot = {
      ...snapshot,
      products: [multiVariantProduct, beyond],
    } satisfies StorefrontSnapshot;
    const journeys = createStorefrontJourneys(liveSnapshot);

    expect(journeys.purchase(journeys.product("purchasable"))).toMatchObject({
      buyLabel: "BUY CORE - $24.00",
      variant: { id: "standard", label: "Standard", price: 2400 },
    });
    expect(journeys.cardPriceLabel(multiVariantProduct)).toBe("From $12.00");
    expect(journeys.cardPriceLabel(beyond)).toBeNull();
    expect(journeys.cardPriceLabel(waitlist)).toBe("Waitlist");
    expect(
      journeys.gallery(multiVariantProduct).map((item) => item.alt),
    ).toEqual(["Core detail", "Core bottle", "Core motion"]);
  });
});
