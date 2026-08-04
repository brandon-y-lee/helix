import type { Metadata } from "next";
import { ShopBrowser } from "@/components/product/ShopBrowser";
import { getCachedProductCards } from "@/lib/catalog-cache";

export const metadata: Metadata = {
  title: "Shop | Mei Pelle",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ collection?: string }>;
}) {
  const [products, params] = await Promise.all([
    getCachedProductCards(),
    searchParams,
  ]);
  const isEmpty = products.length === 0;

  return (
    <>
      <section
        className="storefront-shell shop-hero"
        aria-labelledby="shop-heading"
        data-layout-shell="storefront"
      >
        <div className="shop-hero__surface">
          <p>THE CORE / BEYOND THE CORE</p>
          <h1 id="shop-heading">RAISE YOUR BASELINE.</h1>
        </div>
      </section>
      {isEmpty ? (
        <section
          className="storefront-shell"
          data-layout-shell="storefront"
          style={{ paddingTop: "32px" }}
        >
          <p style={{ color: "var(--ink-soft)" }}>
            No products are available right now.
          </p>
        </section>
      ) : (
        <ShopBrowser products={products} initialCollection={params.collection} />
      )}
    </>
  );
}
