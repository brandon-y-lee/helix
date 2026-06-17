import type { Metadata } from "next";
import { ProductCard } from "@/components/ProductCard";
import { getProducts } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Shop | Mei Pelle",
};

export default async function ProductsPage() {
  const products = await getProducts();
  const isEmpty = products.length === 0;

  return (
    <>
      <div className="container page-head">
        <h1>Shop</h1>
        <p style={{ color: "var(--ink-soft)", marginTop: "10px" }}>
          {isEmpty
            ? "Our catalog is being prepared — check back soon."
            : `The full collection — ${products.length} formulas, one simple routine.`}
        </p>
      </div>
      <section className="container" style={{ paddingTop: "32px" }}>
        {isEmpty ? (
          <p style={{ color: "var(--ink-soft)" }}>
            No products are available right now.
          </p>
        ) : (
          <ul className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
