import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/ProductDetail";
import { ProductDiscoveryCarousel } from "@/components/ProductDiscoveryCarousel";
import {
  getCachedCoreRoutineSummaries,
  getCachedDiscoveryProductCards,
  getCachedPdpProduct,
  getCachedProductMetadata,
  getCachedProductRoutes,
} from "@/lib/catalog-cache";
import { stripeMessagingPublishableKey } from "@/lib/checkout/config";
import type { CoreRoutineSummary } from "@/lib/catalog/models";

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
      ? product.seoTitle ?? `${product.formalTitle} | Mei Pelle`
      : "Product | Mei Pelle",
    description: product?.seoDescription ?? product?.cardTagline,
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

  return (
    <>
      <div className="storefront-shell" data-layout-shell="storefront">
        <ProductDetail
          key={product.slug}
          product={product}
          coreProducts={coreProducts}
          stripePublishableKey={stripeMessagingPublishableKey()}
        />
      </div>
      <ProductDiscoveryCarousel
        currentSlug={product.slug}
        products={related}
      />
    </>
  );
}
