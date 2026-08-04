import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopBrowser } from "@/components/product/ShopBrowser";
import { getCachedProductCards } from "@/lib/catalog-cache";
import {
  getShopCollection,
  SHOP_COLLECTIONS,
} from "@/lib/catalog/collection-routes";

export function generateStaticParams() {
  return SHOP_COLLECTIONS.map(({ slug }) => ({ collection: slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ collection: string }>;
}): Promise<Metadata> {
  const { collection: slug } = await params;
  const collection = getShopCollection(slug);

  if (!collection) notFound();

  return {
    title: `${collection.label} | Mei Pelle`,
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collection: string }>;
}) {
  const [products, { collection: slug }] = await Promise.all([
    getCachedProductCards(),
    params,
  ]);
  const collection = getShopCollection(slug);

  if (!collection) notFound();

  const collectionProducts = collection.routineGroup
    ? products.filter(
        (product) => product.routineGroup === collection.routineGroup,
      )
    : products;

  return (
    <>
      <section
        className="storefront-shell shop-hero"
        aria-labelledby="shop-heading"
        data-layout-shell="storefront"
      >
        <div className="shop-hero__surface">
          <h1 id="shop-heading">raise your baseline</h1>
        </div>
      </section>
      <ShopBrowser
        key={collection.slug}
        products={collectionProducts}
        activeCollection={collection.slug}
      />
    </>
  );
}
