import type { Metadata } from "next";
import Link from "next/link";
import { ProductGrid } from "@/components/ProductGrid";
import { ProductImage } from "@/components/ProductImage";
import { getCachedProducts } from "@/lib/catalog-cache";
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
  const products = await getCachedProducts();
  const featured = featuredProducts(products, 3);
  const collections = collectionNames(products);
  const routineSteps = routine(products, 4);
  const fresh = newArrivals(products, 3);
  const heroProduct = featured[0] ?? products[0];

  return (
    <>
      <section className="hero hero--system">
        <div className="container">
          <div className="hero__grid">
            <div className="hero__copy">
              <p className="hero__eyebrow">Prestige men&apos;s skincare</p>
              <h1>ASCEND.</h1>
              <p>
                A sharper daily system for fresh, conditioned, better-rested skin.
              </p>
              <div className="hero__actions">
                <Link href="/products" className="btn">
                  Shop the system
                </Link>
              </div>
            </div>
            {heroProduct && (
              <Link
                href={`/products/${heroProduct.slug}`}
                className="hero-product"
                aria-label={`Shop ${heroProduct.displayName}`}
              >
                <ProductImage
                  media={heroProduct.detailMedia ?? heroProduct.cardMedia}
                  swatch={heroProduct.swatch}
                  className="hero-product__media"
                  imageClassName="hero-product__img"
                  sizes="(max-width: 860px) 92vw, 50vw"
                  priority
                />
                <span className="hero-product__caption">
                  <span>{heroProduct.routineNumber ?? "01"}</span>
                  {heroProduct.displayName} — {heroProduct.cardTagline}
                </span>
              </Link>
            )}
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
          <ProductGrid products={featured} />
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
                      <ProductImage
                        media={p.cardMedia}
                        swatch={p.swatch}
                        className="routine-step__image"
                        imageClassName="routine-step__img"
                        sizes="52px"
                      />
                    </span>
                    <span className="routine-step__text">
                      <span className="routine-step__collection">
                        {p.collection}
                      </span>
                      <span className="routine-step__name">{p.displayName}</span>
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
          <ProductGrid products={fresh} />
        </section>
      )}
    </>
  );
}
