import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { Swatch } from "@/components/Swatch";
import { getProducts } from "@/lib/catalog";
import {
  featuredProducts,
  newArrivals,
  collectionNames,
  routine,
} from "@/lib/merchandising";

export const metadata: Metadata = {
  title: "Mei Pelle — Prestige Skincare for Men",
};

export default async function HomePage() {
  const products = await getProducts();
  const featured = featuredProducts(products, 3);
  const collections = collectionNames(products);
  const routineSteps = routine(products, 4);
  const fresh = newArrivals(products, 3);

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

      {collections.length > 0 && (
        <section className="container home-section">
          <div className="section-head">
            <h2>Shop by collection</h2>
            <p>Find your step in the routine.</p>
          </div>
          <div className="collection-chips">
            {collections.map((c) => (
              <Link
                key={c}
                href={`/products?collection=${encodeURIComponent(c)}`}
                className="chip chip--link"
              >
                {c}
              </Link>
            ))}
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section className="container home-section">
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
      )}

      {routineSteps.length > 0 && (
        <section className="container home-section">
          <div className="routine-block">
            <div className="routine-block__intro">
              <p className="hero__eyebrow">Start here</p>
              <h2>Build your daily routine</h2>
              <p style={{ color: "var(--ink-soft)" }}>
                One pick from each part of the routine — a simple place to begin.
              </p>
              <Link href="/products" className="btn btn--ghost">
                See everything
              </Link>
            </div>
            <ol className="routine-steps">
              {routineSteps.map((p, i) => (
                <li key={p.slug} className="routine-step">
                  <Link href={`/products/${p.slug}`} className="routine-step__link">
                    <span className="routine-step__index" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="routine-step__media">
                      <Swatch
                        colors={p.swatch}
                        style={{ position: "absolute", inset: 0 }}
                      />
                    </span>
                    <span className="routine-step__text">
                      <span className="routine-step__collection">
                        {p.collection}
                      </span>
                      <span className="routine-step__name">{p.name}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {fresh.length > 0 && (
        <section className="container home-section">
          <div className="section-head">
            <h2>New arrivals</h2>
            <p>The latest to join the lineup.</p>
          </div>
          <ul className="product-grid">
            {fresh.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
