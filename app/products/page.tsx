import type { Metadata } from "next";
import { ShopBrowser } from "@/components/ShopBrowser";
import { getProducts } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Shop | Mei Pelle",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ collection?: string }>;
}) {
  const [products, params] = await Promise.all([getProducts(), searchParams]);
  const isEmpty = products.length === 0;

  return (
    <>
      <div className="container page-head">
        <h1>Shop</h1>
        <p style={{ color: "var(--ink-soft)", marginTop: "10px" }}>
          {isEmpty
            ? "Our catalog is being prepared — check back soon."
            : "The full collection — cleanse, treat, hydrate, protect."}
        </p>
      </div>
      {isEmpty ? (
        <section className="container" style={{ paddingTop: "32px" }}>
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
