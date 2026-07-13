import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/ProductDetail";
import {
  getCachedDiscoveryProducts,
  getCachedProduct,
  getCachedProducts,
} from "@/lib/catalog-cache";

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

  const related = await getCachedDiscoveryProducts(product.slug);

  return (
    <div className="container">
      <ProductDetail product={product} related={related} />
    </div>
  );
}
