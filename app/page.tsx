import type { Metadata } from "next";
import Link from "next/link";
import { HomeHeroVideo } from "@/components/HomeHeroVideo";
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

  return (
    <>
      <section className="home-video-hero" aria-labelledby="home-hero-heading">
        <HomeHeroVideo />
        <div className="home-video-hero__scrim" aria-hidden="true" />
        <div className="home-video-hero__content">
          <div>
            <h1 id="home-hero-heading" className="display-secondary home-video-hero__title">
              ascend.
            </h1>
            <Link href="/products" className="home-video-hero__cta">
              EXPLORE NOW
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
