import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/ProductDetail";
import {
  getCachedCoreRoutineProducts,
  getCachedDiscoveryProducts,
  getCachedProduct,
  getCachedProducts,
} from "@/lib/catalog-cache";
import { stripeMessagingPublishableKey } from "@/lib/checkout/config";
import type { CoreRoutineProduct } from "@/lib/products";

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
  const product = await getCachedProduct(slug);
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
  const product = await getCachedProduct(slug);

  if (!product) {
    notFound();
  }

  const relatedPromise = getCachedDiscoveryProducts(product.slug);
  let coreRoutine: CoreRoutineProduct[] = [];
  if (product.routineGroup === "core") {
    try {
      coreRoutine = await getCachedCoreRoutineProducts();
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
    <div className="container">
      <ProductDetail
        product={product}
        related={related}
        coreRoutine={coreRoutine}
        stripePublishableKey={stripeMessagingPublishableKey()}
      />
    </div>
  );
}
