import type { Metadata } from "next";
import Link from "next/link";
import { HomeBeyondCoreShowcase } from "@/components/home/HomeBeyondCoreShowcase";
import { HomeBackgroundVideo } from "@/components/home/HomeBackgroundVideo";
import { HomeCoreShowcase } from "@/components/home/HomeCoreShowcase";
import { HomePrinciplesPortrait } from "@/components/home/HomePrinciplesPortrait";
import { HomeThreePrinciples } from "@/components/home/HomeThreePrinciples";
import {
  getCachedIngredientIndexProducts,
  getCachedProductCards,
} from "@/lib/catalog-cache";
import {
  CORE_ROUTINE_PRODUCT_SLUGS,
  type ProductCard,
} from "@/lib/catalog/models";
import { homeThreePrinciples } from "@/lib/content/home";
import {
  buildIngredientIndex,
  ingredientAnchorId,
  type IngredientIndexCard,
  type MethodProductSlug,
} from "@/lib/content/system";

export const metadata: Metadata = {
  title: "helix | Men's Skincare",
  description:
    "A simple daily system for skin that looks better now—and stays smooth, even, and resilient over time.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "helix | Men's Skincare",
    description:
      "A simple daily system for skin that looks better now—and stays smooth, even, and resilient over time.",
    url: "/",
    siteName: "helix",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "helix | Men's Skincare",
    description:
      "A simple daily system for skin that looks better now—and stays smooth, even, and resilient over time.",
  },
};

const CORE_PRODUCT_SLUGS =
  CORE_ROUTINE_PRODUCT_SLUGS satisfies readonly MethodProductSlug[];

const BEYOND_CORE_PRODUCT_SLUGS = [
  "balancing-prep",
  "frame-04-pdrn-eye-cream",
  "lift-06-pdrn-mask-system",
] as const satisfies readonly MethodProductSlug[];

const INGREDIENT_LINK_LABELS: Record<string, string> = {
  pdrn: "PDRN",
  peptides: "Peptides",
  niacinamide: "Niacinamide",
};

function productsForSlugs(
  productsBySlug: ReadonlyMap<string, ProductCard>,
  slugs: readonly MethodProductSlug[],
): ProductCard[] {
  return slugs.flatMap((slug) => {
    const product = productsBySlug.get(slug);
    return product ? [product] : [];
  });
}

function ingredientPreviewLabel(card: IngredientIndexCard) {
  return `Read about ${INGREDIENT_LINK_LABELS[card.id] ?? card.name} in the System`;
}

export default async function HomePage() {
  const [products, ingredientProducts] = await Promise.all([
    getCachedProductCards(),
    getCachedIngredientIndexProducts(),
  ]);
  const productsBySlug = new Map(products.map((product) => [product.slug, product]));
  const coreProducts = productsForSlugs(productsBySlug, CORE_PRODUCT_SLUGS);
  const ingredientCards = buildIngredientIndex(ingredientProducts).slice(0, 3);
  const beyondCoreProducts = productsForSlugs(
    productsBySlug,
    BEYOND_CORE_PRODUCT_SLUGS,
  );

  return (
    <>
      <section
        className="home-video-hero"
        data-header-layout="overlay"
        data-header-theme="light"
        aria-labelledby="home-hero-heading"
      >
        <HomeBackgroundVideo placement="hero" />
        <div className="home-video-hero__scrim" aria-hidden="true" />
        <div className="home-video-hero__content">
          <div>
            <p className="home-video-hero__eyebrow">helix</p>
            <h1 id="home-hero-heading" className="display-secondary home-video-hero__title">
              Your skin starts with three steps.
            </h1>
            <p className="home-video-hero__display-line">Cleanse. Treat. Seal.</p>
            <div className="home-video-hero__actions">
              <Link href="#core-three" className="home-video-hero__cta">
                SHOP THE CORE
              </Link>
              <Link href="/system" className="home-video-hero__secondary">
                SEE THE SYSTEM
              </Link>
            </div>
          </div>
        </div>
      </section>

      <HomeCoreShowcase products={coreProducts} />

      <section
        className="home-section home-section--principles"
        aria-labelledby="home-three-principles-heading"
      >
        <div className="home-three-principles-panel">
          <HomeThreePrinciples
            headingId="home-three-principles-heading"
            principles={homeThreePrinciples}
          />
        </div>
        <div className="home-three-principles-visual">
          <HomePrinciplesPortrait />
        </div>
      </section>

      <section className="home-section home-section--core-support" aria-labelledby="plug-play-heading">
        <div className="home-plug-split">
          <div className="home-plug-media">
            <HomeBackgroundVideo placement="plug" />
            <p className="home-plug-media__caption">
              For skin that is clearer, more hydrated, and less tired.
            </p>
          </div>
          <article className="home-plug-panel">
            <h2 id="plug-play-heading" className="home-plug-panel__title" aria-label="Plug and Play">
              <span aria-hidden="true">Plug</span>
              <span aria-hidden="true">and</span>
              <span aria-hidden="true">Play</span>
            </h2>
            <div className="home-plug-panel__body">
              <p>
                The Core is designed to work as a full routine. <br />
                Or simply upgrade the layer your current routine is missing
                or underperforming in.
              </p>
              <Link
                href="#core-three"
                className="btn btn--editorial-rounded home-plug-panel__cta"
              >
                Explore The Core
              </Link>
            </div>
          </article>
        </div>
      </section>

      <HomeBeyondCoreShowcase products={beyondCoreProducts} />

      <section className="home-band home-section" aria-labelledby="ingredients-heading">
        <div
          className="storefront-shell home-split home-split--ingredients"
          data-layout-shell="storefront"
        >
          <div className="storefront-reading">
            <h2 id="ingredients-heading">Know what you are using.</h2>
            <p>
              Learn how our formulas nourish your skin--instantly, and years down the line. <br />
              Our index explains what an ingredient is, where it appears, and how its formula supports your skin.
            </p>
            <Link href="/system#system-ingredients" className="btn btn--ghost btn--editorial-rounded">
              READ THE INDEX
            </Link>
          </div>

          {ingredientCards.length > 0 && (
            <div className="home-ingredient-list" aria-label="Ingredient literacy preview">
              {ingredientCards.map((card) => (
                <Link
                  key={card.id}
                  href={`/system#${ingredientAnchorId(card.id)}`}
                  className="home-ingredient-card"
                  aria-label={ingredientPreviewLabel(card)}
                >
                  <p>{card.ingredientClass}</p>
                  <h3>{card.name}</h3>
                  <span>{card.skinRelevance}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="home-section home-section--final" aria-labelledby="final-heading">
        <HomeBackgroundVideo placement="final" />
        <div className="home-final">
          <h2 id="final-heading" className="display-secondary home-final__title">
            Invest in your skin.
          </h2>
          <p className="home-final__copy">
            Three steps, one order, repeatable morning or night.
          </p>
          <div className="hero__actions home-video-hero__actions home-final__actions">
            <Link href="#core-three" className="home-final__cta home-final__cta--primary">
              Shop The Core
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
