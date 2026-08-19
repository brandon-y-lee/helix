import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ProductDetail } from "@/components/product-detail/ProductDetail";
import { ProductCarousel } from "@/components/product/ProductCarousel";
import {
  getCachedCoreRoutineSummaries,
  getCachedDiscoveryProductCards,
  getCachedPdpProduct,
  getCachedProductMetadata,
  getCachedProductSlugResolution,
} from "@/lib/catalog-cache";
import { stripeMessagingPublishableKey } from "@/lib/checkout/config";
import type { CoreRoutineSummary } from "@/lib/catalog/models";
import { PDP_DISCOVERY_PRODUCT_LIMIT } from "@/lib/catalog/discovery";
import { composeProductTitle } from "@/lib/products";
import {
  buildProductStructuredData,
  serializeStructuredData,
} from "@/lib/catalog/product-structured-data";
import { isValidProductSlug } from "@/lib/catalog/product-slug";
import { resolvePublicSiteOrigin } from "@/lib/site-url";

const siteUrl = new URL(resolvePublicSiteOrigin());

// Product aliases are governed data and may be published after a deployment.
// Keep the route request-time while its public Catalog projections remain
// independently cached, so every current or future alias can resolve without
// a rebuild and preserve the incoming query string.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolution = isValidProductSlug(slug)
    ? await getCachedProductSlugResolution(slug)
    : undefined;
  const product = resolution
    ? await getCachedProductMetadata(resolution.targetSlug)
    : undefined;
  const title = product
    ? product.seoTitle ??
      `${composeProductTitle(product.displayName, product.productType)} | helix`
    : "Product | helix";
  const description = product?.seoDescription ?? product?.editorialDescription;
  return {
    title,
    description,
    alternates: product
      ? { canonical: `/products/${product.slug}` }
      : undefined,
    openGraph: {
      title,
      description,
      ...(product ? { url: `/products/${product.slug}` } : {}),
      siteName: "helix",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

type ProductSearchParams = Record<
  string,
  string | string[] | undefined
>;

function productRedirectDestination(
  targetSlug: string,
  searchParams: ProductSearchParams,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }
  const serialized = query.toString();
  return `/products/${targetSlug}${serialized ? `?${serialized}` : ""}`;
}

export default async function ProductDetailPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<ProductSearchParams>;
}) {
  const { slug } = await params;
  if (!isValidProductSlug(slug)) {
    notFound();
  }
  const resolution = await getCachedProductSlugResolution(slug);

  if (!resolution) {
    notFound();
  }

  if (resolution.targetSlug !== slug) {
    permanentRedirect(
      productRedirectDestination(resolution.targetSlug, await searchParams),
    );
  }

  const product = await getCachedPdpProduct(resolution.targetSlug);

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
