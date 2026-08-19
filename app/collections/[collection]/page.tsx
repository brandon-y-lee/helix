import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ShopBrowser } from "@/components/product/ShopBrowser";
import { getCachedProductCards } from "@/lib/catalog-cache";
import {
  getShopCollection,
  SHOP_COLLECTIONS,
} from "@/lib/catalog/collection-routes";
import { createPublicSiteMetadata } from "@/lib/public-site-metadata";

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

  const title = `${collection.label} | helix`;
  const description = `Explore ${collection.label} across The Core and Beyond The Core at helix.`;

  return createPublicSiteMetadata({
    title,
    description,
    canonical: `/collections/${collection.slug}`,
  });
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
          <Image
            src="/media/collections/raise-your-baseline-hero.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 720px) calc(100vw - 32px), calc(100vw - 60px)"
            className="shop-hero__image"
          />
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
