import { createRequire } from "node:module";
import { formatPrice, productPurchaseCta } from "@/lib/products";
import {
  StorefrontBaselineError,
  type StorefrontSnapshot,
  type StorefrontSnapshotProduct,
} from "@/test-support/storefront-baseline";
import {
  createStorefrontJourneys,
  type StorefrontJourneys,
} from "@/test-support/storefront-journeys";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 250;

type ReconciliationOptions = {
  baseURL: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  pollIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
};

type DocumentFactory = new (html?: string) => {
  window: { document: Document };
};

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom") as { JSDOM: DocumentFactory };

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readDocument(
  baseURL: string,
  path: string,
  request: typeof globalThis.fetch,
  signal: AbortSignal,
): Promise<Document> {
  const response = await request(new URL(path, baseURL), { signal });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}.`);
  }
  return new JSDOM(await response.text()).window.document;
}

function collectionMismatches(
  document: Document,
  path: string,
  expected: readonly StorefrontSnapshotProduct[],
  journeys: StorefrontJourneys,
): string[] {
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>("[data-product-card-slug]"),
  );
  const actualSlugs = cards.map(
    (card) => card.dataset.productCardSlug ?? "",
  );
  const expectedSlugs = expected.map((product) => product.slug);
  const mismatches: string[] = [];

  if (actualSlugs.join("|") !== expectedSlugs.join("|")) {
    mismatches.push(
      `${path} Product order was [${actualSlugs.join(", ")}] instead of [${expectedSlugs.join(", ")}].`,
    );
  }

  const count = document.querySelector(".product-count")?.textContent?.trim();
  const expectedCount = `${expected.length} ${expected.length === 1 ? "product" : "products"}`;
  if (count !== expectedCount) {
    mismatches.push(
      `${path} count was "${count ?? "missing"}" instead of "${expectedCount}".`,
    );
  }

  for (const product of expected) {
    const card = cards.find(
      (item) => item.dataset.productCardSlug === product.slug,
    );
    const name = card
      ?.querySelector(".product-card__name")
      ?.textContent?.trim();
    if (name !== product.displayName) {
      mismatches.push(
        `${path} Product "${product.slug}" was named "${name ?? "missing"}" instead of "${product.displayName}".`,
      );
    }
    const price = card
      ?.querySelector(".product-card__price")
      ?.textContent?.trim();
    const expectedPrice = journeys.cardPriceLabel(product);
    if (price !== expectedPrice) {
      mismatches.push(
        `${path} Product "${product.slug}" price was "${price ?? "missing"}" instead of "${expectedPrice}".`,
      );
    }
    const quickBuy = card
      ?.querySelector(".product-card__quick-trigger")
      ?.textContent?.trim();
    const expectedQuickBuy = product.offer
      ? journeys.purchase(product).buyLabel
      : "OUT OF STOCK";
    if (quickBuy !== expectedQuickBuy) {
      mismatches.push(
        `${path} Product "${product.slug}" purchase label was "${quickBuy ?? "missing"}" instead of "${expectedQuickBuy}".`,
      );
    }
    if (product.variants.length > 1) {
      const optionLabels = Array.from(
        card?.querySelectorAll(".product-card__quick-option") ?? [],
        (option) => ({
          label: option.querySelector("span")?.textContent?.trim() ?? "",
          price: option.querySelector("small")?.textContent?.trim() ?? "",
        }),
      );
      const expectedOptions = product.variants.map((variant) => ({
        label: variant.label,
        price: formatPrice(variant.price),
      }));
      if (JSON.stringify(optionLabels) !== JSON.stringify(expectedOptions)) {
        mismatches.push(
          `${path} Product "${product.slug}" Product Variant options did not match the immutable snapshot.`,
        );
      }
    }
  }

  return mismatches;
}

function pdpMismatches(
  document: Document,
  product: StorefrontSnapshotProduct,
  requireRichMedia: boolean,
  journeys: StorefrontJourneys,
): string[] {
  const mismatches: string[] = [];
  const heading = document.querySelector("h1")?.textContent?.trim();
  if (heading !== product.displayName) {
    mismatches.push(
      `${product.path} heading was "${heading ?? "missing"}" instead of "${product.displayName}".`,
    );
  }

  const variantLabels = Array.from(
    document.querySelectorAll(".variant-options button"),
    (button) => button.textContent?.trim() ?? "",
  );
  const expectedLabels = product.variants.map((variant) => variant.label);
  if (variantLabels.join("|") !== expectedLabels.join("|")) {
    mismatches.push(
      `${product.path} Product Variant labels were [${variantLabels.join(", ")}] instead of [${expectedLabels.join(", ")}].`,
    );
  }

  const initialVariant = product.variants[0];
  const price = document.querySelector(".pdp__price")?.textContent?.trim();
  const expectedPrice = initialVariant ? formatPrice(initialVariant.price) : "—";
  if (price !== expectedPrice) {
    mismatches.push(
      `${product.path} initial Product Offer price was "${price ?? "missing"}" instead of "${expectedPrice}".`,
    );
  }
  const purchaseLabel = document
    .querySelector("[data-pdp-buy-button]")
    ?.textContent?.trim();
  const expectedPurchaseLabel = productPurchaseCta(
    {
      displayName: product.displayName,
      status: product.merchandisingStatus,
      variants: product.variants,
    },
    initialVariant,
  ).label;
  if (purchaseLabel !== expectedPurchaseLabel) {
    mismatches.push(
      `${product.path} initial purchase label was "${purchaseLabel ?? "missing"}" instead of "${expectedPurchaseLabel}".`,
    );
  }

  if (requireRichMedia) {
    const regionLabels = Array.from(
      document.querySelectorAll<HTMLElement>("[aria-label]"),
      (element) => element.getAttribute("aria-label"),
    );
    const routineVideoLabel = `${product.displayName} routine video`;
    if (!regionLabels.includes(routineVideoLabel)) {
      mismatches.push(
        `${product.path} was missing the "${routineVideoLabel}" region.`,
      );
    }

    const thumbnailLabels = Array.from(
      document.querySelectorAll<HTMLElement>("[data-pdp-media-thumbnail]"),
      (element) => element.getAttribute("aria-label") ?? "",
    );
    const expectedLabels = journeys.gallery(product).map(
      (item) =>
        `View ${item.alt}, media ${item.index} of ${item.total}`,
    );
    if (JSON.stringify(thumbnailLabels) !== JSON.stringify(expectedLabels)) {
      mismatches.push(
        `${product.path} gallery media did not match the immutable snapshot.`,
      );
    }
  }

  return mismatches;
}

async function currentMismatches(
  snapshot: StorefrontSnapshot,
  options: Pick<ReconciliationOptions, "baseURL"> & {
    fetch: typeof globalThis.fetch;
    signal: AbortSignal;
  },
): Promise<string[]> {
  const journeys = createStorefrontJourneys(snapshot);
  const collections = [
    { path: "/collections/shop", products: journeys.products() },
    {
      path: "/collections/core",
      products: journeys.products("core"),
    },
    {
      path: "/collections/beyond-the-core",
      products: journeys.products("beyondCore"),
    },
  ] as const;
  const mismatches: string[] = [];

  for (const collection of collections) {
    const document = await readDocument(
      options.baseURL,
      collection.path,
      options.fetch,
      options.signal,
    );
    mismatches.push(
      ...collectionMismatches(
        document,
        collection.path,
        collection.products,
        journeys,
      ),
    );
  }

  const richProduct = journeys.product("richPdp");
  const purchasableProduct = journeys.product("purchasable");
  const systemNavigationProduct = journeys.product("systemNavigation");
  for (const product of new Map(
    [richProduct, purchasableProduct, systemNavigationProduct].map((item) => [
      item.id,
      item,
    ]),
  ).values()) {
    const document = await readDocument(
      options.baseURL,
      product.path,
      options.fetch,
      options.signal,
    );
    mismatches.push(
      ...pdpMismatches(
        document,
        product,
        product.id === richProduct.id,
        journeys,
      ),
    );
  }

  return mismatches;
}

export async function reconcileStorefrontSnapshot(
  snapshot: StorefrontSnapshot,
  options: ReconciliationOptions,
): Promise<void> {
  const now = options.now ?? Date.now;
  const wait = options.sleep ?? sleep;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs =
    options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = now() + timeoutMs;
  let lastMismatches: string[] = [];

  do {
    const remainingBeforeRead = deadline - now();
    if (remainingBeforeRead <= 0) break;
    const controller = new AbortController();
    const abortTimer = setTimeout(
      () => controller.abort(),
      remainingBeforeRead,
    );
    try {
      lastMismatches = await currentMismatches(snapshot, {
        baseURL: options.baseURL,
        fetch: options.fetch ?? globalThis.fetch,
        signal: controller.signal,
      });
      if (lastMismatches.length === 0) return;
    } catch (cause) {
      lastMismatches = [
        cause instanceof Error
          ? cause.message
          : "The Storefront could not be read.",
      ];
    } finally {
      clearTimeout(abortTimer);
    }

    const remaining = deadline - now();
    if (remaining <= 0) break;
    await wait(Math.min(pollIntervalMs, remaining));
  } while (now() <= deadline);

  throw new StorefrontBaselineError(
    "cache-reconciliation",
    `The built Storefront did not converge to the immutable live snapshot within ${timeoutMs / 1_000}s. ` +
      `${lastMismatches.join(" ")} Reconcile the Storefront Catalog/cache seam and rerun; ` +
      "if the Catalog changed after snapshot creation, this run will not update its expectations in place.",
  );
}
