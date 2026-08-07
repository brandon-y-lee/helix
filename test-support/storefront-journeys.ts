import { formatPrice } from "@/lib/products";
import {
  StorefrontBaselineError,
  type StorefrontSnapshot,
  type StorefrontSnapshotMedia,
  type StorefrontSnapshotProduct,
  type StorefrontSnapshotVariant,
} from "@/test-support/storefront-baseline";

export type StorefrontJourney =
  | "core"
  | "beyondCore"
  | "purchasable"
  | "richPdp"
  | "searchable";

export type StorefrontCollection = "shop" | "core" | "beyondCore";

export type StorefrontPurchase = Readonly<{
  buyLabel: string;
  product: StorefrontSnapshotProduct;
  variant: StorefrontSnapshotVariant;
}>;

export type StorefrontGalleryItem = Readonly<{
  alt: string;
  index: number;
  media: StorefrontSnapshotMedia;
  total: number;
}>;

const JOURNEY_KEYS = {
  core: "coreProductId",
  beyondCore: "beyondCoreProductId",
  purchasable: "purchasableProductId",
  richPdp: "richPdpProductId",
  searchable: "searchableProductId",
} as const satisfies Readonly<
  Record<StorefrontJourney, keyof StorefrontSnapshot["journeys"]>
>;

function requireProduct(
  snapshot: StorefrontSnapshot,
  productId: string,
): StorefrontSnapshotProduct {
  const product = snapshot.products.find((item) => item.id === productId);
  if (product) return product;
  throw new StorefrontBaselineError(
    "invalid-snapshot-artifact",
    `Journey Product "${productId}" is missing from the Storefront snapshot.`,
  );
}

function normalizeMediaUrl(url: string): string {
  try {
    const base = "https://mei-pelle.invalid";
    const parsed = new URL(url, base);
    const origin = parsed.origin === base ? "" : parsed.origin.toLowerCase();
    const pathname = parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
    return `${origin}${pathname}`;
  } catch {
    return url.split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/").replace(/\/$/, "");
  }
}

function galleryMedia(product: StorefrontSnapshotProduct) {
  const presentation = product.media.filter(
    (media) => media.kind !== "video" && Boolean(media.url),
  );
  const card =
    presentation.find((media) => media.role === "card_default") ??
    presentation.find((media) => media.role === "card") ??
    presentation.find((media) => media.role === "detail") ??
    presentation.find((media) => media.role === "hero") ??
    null;
  const primary =
    presentation.find((media) => media.role === "detail") ??
    presentation.find((media) => media.role === "hero") ??
    card;
  const gallery = presentation
    .filter((media) => media.role === "gallery")
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const identities = new Set<string>();

  return [primary, ...gallery]
    .filter((media): media is StorefrontSnapshotMedia => media !== null)
    .filter((media) => {
      const identity = `${media.kind}:${normalizeMediaUrl(media.url ?? "")}`;
      if (identities.has(identity)) return false;
      identities.add(identity);
      return true;
    });
}

export function createStorefrontJourneys(snapshot: StorefrontSnapshot) {
  return Object.freeze({
    snapshot,
    product(journey: StorefrontJourney): StorefrontSnapshotProduct {
      return requireProduct(snapshot, snapshot.journeys[JOURNEY_KEYS[journey]]);
    },
    productAtPath(path: string): StorefrontSnapshotProduct {
      const product = snapshot.products.find((item) => item.path === path);
      if (product) return product;
      throw new StorefrontBaselineError(
        "invalid-snapshot-artifact",
        `Storefront path "${path}" is missing from the immutable snapshot. Rerun after Catalog/cache reconciliation.`,
      );
    },
    collection(collection: StorefrontCollection = "shop") {
      if (collection === "shop") return snapshot.products;
      const routineGroup = collection === "core" ? "core" : "beyond_core";
      return snapshot.products.filter(
        (product) => product.routineGroup === routineGroup,
      );
    },
    purchase(product: StorefrontSnapshotProduct): StorefrontPurchase {
      const offer = product.offer;
      const variant = offer
        ? product.variants.find((item) => item.id === offer.variantId)
        : undefined;
      if (!offer || !variant) {
        throw new StorefrontBaselineError(
          "invalid-snapshot-artifact",
          `Product "${product.slug}" does not satisfy the Purchasable journey.`,
        );
      }
      return Object.freeze({
        buyLabel: `BUY ${product.displayName} - ${formatPrice(offer.price)}`,
        product,
        variant,
      });
    },
    cardPriceLabel(product: StorefrontSnapshotProduct): string {
      const startingPrice = product.variants.length
        ? Math.min(...product.variants.map((variant) => variant.price))
        : 0;
      return `${product.variants.length > 1 ? "From " : ""}${formatPrice(startingPrice)}`;
    },
    gallery(product: StorefrontSnapshotProduct): readonly StorefrontGalleryItem[] {
      const media = galleryMedia(product);
      return Object.freeze(
        media.map((item, index) =>
          Object.freeze({
            alt: item.alt,
            index: index + 1,
            media: item,
            total: media.length,
          }),
        ),
      );
    },
  });
}

export type StorefrontJourneys = ReturnType<typeof createStorefrontJourneys>;
