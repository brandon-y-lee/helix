import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/product-detail/ProductDetail";
import { ProductCarousel } from "@/components/product/ProductCarousel";
import {
  getCachedCoreRoutineSummaries,
  getCachedDiscoveryProductCards,
  getCachedPdpProduct,
  getCachedProductMetadata,
  getCachedProductRoutes,
} from "@/lib/catalog-cache";
import { stripeMessagingPublishableKey } from "@/lib/checkout/config";
import type { CoreRoutineSummary } from "@/lib/catalog/models";
import { PDP_DISCOVERY_PRODUCT_LIMIT } from "@/lib/catalog/discovery";
import { composeProductTitle } from "@/lib/products";
import {
  buildProductStructuredData,
  serializeStructuredData,
} from "@/lib/catalog/product-structured-data";

const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
);

export async function generateStaticParams() {
  const products = await getCachedProductRoutes();
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCachedProductMetadata(slug);
  return {
    title: product
      ? product.seoTitle ??
        `${composeProductTitle(product.displayName, product.productType)} | Mei Pelle`
      : "Product | Mei Pelle",
    description: product?.seoDescription ?? product?.editorialDescription,
    alternates: product
      ? { canonical: `/products/${product.slug}` }
      : undefined,
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getCachedPdpProduct(slug);

  if (!product) {
    notFound();
  }

  const relatedPromise = getCachedDiscoveryProductCards(product.slug);
  let coreProducts: CoreRoutineSummary[] = [];
  if (product.routineGroup === "core") {
    try {
      coreProducts = await getCachedCoreRoutineSummaries();
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : "[catalog] Core routine unavailable.",
      );
    }
  }
  const related = await relatedPromise;
  const structuredData = buildProductStructuredData(product, siteUrl);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeStructuredData(structuredData),
        }}
      />
      <div className="storefront-shell" data-layout-shell="storefront">
        <ProductDetail
          key={product.slug}
          product={product}
          coreProducts={coreProducts}
          stripePublishableKey={stripeMessagingPublishableKey()}
        />
      </div>
      {related.length > 0 && (
        <section
          className="storefront-carousel-shell pdp-discovery"
          aria-label="Recommended products"
          data-layout-shell="carousel"
          data-product-collection="discovery"
          data-product-count={related.length}
          data-product-limit={PDP_DISCOVERY_PRODUCT_LIMIT}
        >
          <ProductCarousel
            products={related}
            ariaLabel="Recommended product carousel"
            announcementContext="the recommended products"
            className="pdp-discovery__carousel"
          />
        </section>
      )}
    </>
  );
}
