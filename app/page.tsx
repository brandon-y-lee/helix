import type { Metadata } from "next";
import Link from "next/link";
import { HomeHeroVideo } from "@/components/HomeHeroVideo";
import { ProductGrid } from "@/components/ProductGrid";
import { ProductImage } from "@/components/ProductImage";
import { getCachedProducts } from "@/lib/catalog-cache";
import {
  PROTECT_STEP,
  deriveMethodRoutineSteps,
  type DerivedMethodStep,
} from "@/lib/content/method";
import type { Product } from "@/lib/products";
import {
  newArrivals,
} from "@/lib/merchandising";

export const metadata: Metadata = {
  title: "Mei Pelle — Prestige Skincare for Men",
};

function productsFromMethodPreset(products: Product[], count: 3 | 4) {
  return deriveMethodRoutineSteps(products, count).flatMap((step) =>
    step.kind === "product" && step.product ? [step.product] : [],
  );
}

function renderRoutineStep(step: DerivedMethodStep) {
  if (step.kind === "protect") {
    return (
      <li key={step.id} className="routine-step routine-step--protect">
        <Link
          href="/method#step-protect"
          className="routine-step__link routine-step__link--editorial"
          aria-label="View PROTECT Method step, coming soon"
        >
          <span className="routine-step__index" aria-hidden="true">
            {step.displayNumber}
          </span>
          <span className="routine-step__media routine-step__media--protect" aria-hidden="true">
            <span className="routine-step__protect-mark">SPF</span>
          </span>
          <span className="routine-step__text">
            <span className="routine-step__collection">{PROTECT_STEP.status}</span>
            <span className="routine-step__name">{PROTECT_STEP.displayName}</span>
            <span className="routine-step__note">Final morning SPF step</span>
          </span>
        </Link>
      </li>
    );
  }

  if (!step.product) return null;

  return (
    <li key={step.slug} className="routine-step">
      <Link href={`/products/${step.product.slug}`} className="routine-step__link">
        <span className="routine-step__index" aria-hidden="true">
          {step.displayNumber}
        </span>
        <span className="routine-step__media">
          <ProductImage
            media={step.product.cardMedia}
            swatch={step.product.swatch}
            className="routine-step__image"
            imageClassName="routine-step__img"
            sizes="52px"
          />
        </span>
        <span className="routine-step__text">
          <span className="routine-step__collection">
            {step.product.collection}
          </span>
          <span className="routine-step__name">{step.product.displayName}</span>
        </span>
      </Link>
    </li>
  );
}

export default async function HomePage() {
  const products = await getCachedProducts();
  const featured = productsFromMethodPreset(products, 3);
  const routineSteps = deriveMethodRoutineSteps(products, 4).filter(
    (step) => step.kind === "protect" || Boolean(step.product),
  );
  const fresh = newArrivals(products, 3);

  return (
    <>
      <section
        className="home-video-hero"
        data-header-theme="light"
        aria-labelledby="home-hero-heading"
      >
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
              <Link href="/method" className="btn btn--ghost btn--editorial-rounded">
                VIEW THE METHOD
              </Link>
            </div>
            <ol className="routine-steps">
              {routineSteps.map((step) => renderRoutineStep(step))}
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
