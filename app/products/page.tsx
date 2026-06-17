import type { Metadata } from "next";
import { ProductCard } from "@/components/ProductCard";
import { products } from "@/lib/products";

export const metadata: Metadata = {
  title: "Shop | Mei Pelle",
};

export default function ProductsPage() {
  return (
    <>
      <div className="container page-head">
        <h1>Shop</h1>
        <p style={{ color: "var(--ink-soft)", marginTop: "10px" }}>
          The full collection — {products.length} formulas, one simple routine.
        </p>
      </div>
      <section className="container" style={{ paddingTop: "32px" }}>
        <ul className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </ul>
      </section>
    </>
  );
}
