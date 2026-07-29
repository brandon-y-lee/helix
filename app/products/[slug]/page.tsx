import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/ProductDetail";
import { ProductDiscoveryCarousel } from "@/components/ProductDiscoveryCarousel";
import {
  getCachedCoreRoutineProducts,
  getCachedDiscoveryProducts,
  getCachedProduct,
  getCachedProductContent,
  getCachedProducts,
} from "@/lib/catalog-cache";
import { stripeMessagingPublishableKey } from "@/lib/checkout/config";
import type { CoreRoutineProduct, Product } from "@/lib/products";

export async function generateStaticParams() {
  const products = await getCachedProducts();
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCachedProductContent(slug);
  return {
    title: product
      ? product.seoTitle ?? `${product.formalTitle} | Mei Pelle`
      : "Product | Mei Pelle",
    description: product?.seoDescription ?? product?.tagline,
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getCachedProduct(slug);

  if (!product) {
    notFound();
  }

  const relatedPromise = getCachedDiscoveryProducts(product.slug);
  let coreRoutine: CoreRoutineProduct[] = [];
  let coreProducts: Product[] = [];
  if (product.routineGroup === "core") {
    const [routineResult, productsResult] = await Promise.allSettled([
      getCachedCoreRoutineProducts(),
      getCachedProducts(),
    ]);
    if (routineResult.status === "fulfilled") {
      coreRoutine = routineResult.value;
    } else {
      console.error(
        routineResult.reason instanceof Error
          ? routineResult.reason.message
          : "[catalog] Core routine unavailable.",
      );
    }
    if (productsResult.status === "fulfilled") {
      coreProducts = productsResult.value.filter(
        (candidate) => candidate.routineGroup === "core",
      );
    } else {
      console.error(
        productsResult.reason instanceof Error
          ? productsResult.reason.message
          : "[catalog] Core product details unavailable.",
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
          coreRoutine={coreRoutine}
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
