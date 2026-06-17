import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { products } from "@/lib/products";

export const metadata: Metadata = {
  title: "Mei Pelle — Prestige Skincare for Men",
};

export default function HomePage() {
  const featured = products.slice(0, 3);

  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="hero__eyebrow">Prestige skincare, simplified</p>
          <h1>A focused routine for skin that actually shows up.</h1>
          <p>
            Six considered formulas — cleanse, treat, hydrate, protect. No
            clutter, no guesswork. Just the steps that earn their place on the
            shelf.
          </p>
          <div className="hero__actions">
            <Link href="/products" className="btn">
              Shop the collection
            </Link>
            <Link
              href="/products/northpoint-renewal-serum"
              className="btn btn--ghost"
            >
              Meet the serum
            </Link>
          </div>
        </div>
      </section>

      <section className="container">
        <div className="section-head">
          <h2>Featured</h2>
          <p>The essentials to start with.</p>
        </div>
        <ul className="product-grid">
          {featured.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </ul>
      </section>
    </>
  );
}
