import type { PdpProduct } from "@/lib/catalog/models";
import { composeProductTitle } from "@/lib/products";

type StructuredData = Record<string, unknown>;

function purchasableOffers(
  product: PdpProduct,
  productUrl: string,
): StructuredData[] {
  if (product.status !== "available") return [];
  return product.variants
    .filter(
      (variant) =>
        variant.available &&
        variant.inventoryStatus !== "out_of_stock" &&
        variant.inventoryStatus !== "unavailable",
    )
    .map((variant) => ({
      "@type": "Offer",
      url: productUrl,
      price: (variant.price / 100).toFixed(2),
      priceCurrency: product.currency,
      availability: "https://schema.org/InStock",
    }));
}

export function buildProductStructuredData(
  product: PdpProduct,
  siteUrl: URL,
): StructuredData {
  const productUrl = new URL(`/products/${product.slug}`, siteUrl).toString();
  const image = product.media.flatMap((item) =>
    item.kind === "image" && item.url ? [item.url] : [],
  );
  const offers = purchasableOffers(product, productUrl);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: composeProductTitle(product.displayName, product.productType),
    description: product.description,
    url: productUrl,
    brand: { "@type": "Brand", name: "Mei Pelle" },
    ...(image.length > 0 ? { image } : {}),
    ...(offers.length > 0 ? { offers } : {}),
  };
}

export function serializeStructuredData(value: StructuredData): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
