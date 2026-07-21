import type { Metadata } from "next";
import Link from "next/link";
import { HomeBeyondCoreShowcase } from "@/components/HomeBeyondCoreShowcase";
import { HomeCoreShowcase } from "@/components/HomeCoreShowcase";
import { HomeFinalVideo } from "@/components/HomeFinalVideo";
import { HomeHeroVideo } from "@/components/HomeHeroVideo";
import { HomePlugVideo } from "@/components/HomePlugVideo";
import { HomePrinciplesPortrait } from "@/components/HomePrinciplesPortrait";
import { HomeThreePrinciples } from "@/components/HomeThreePrinciples";
import { getCachedProducts } from "@/lib/catalog-cache";
import { homeThreePrinciples } from "@/lib/content/home";
import {
  buildIngredientIndex,
  ingredientAnchorId,
  type IngredientIndexCard,
  type MethodProductSlug,
} from "@/lib/content/system";
import type { Product } from "@/lib/products";

export const metadata: Metadata = {
  title: "Mei Pelle | Men's Skincare",
  description:
    "A three-step men's skincare baseline: cleanse, treat, and seal with CLEANSE, TREAT, and SEAL.",
};

const CORE_PRODUCT_SLUGS = [
  "cleanse-01-calming-gel-cleanser",
  "treat-03-pdrn-5-ampoule",
  "seal-05-green-collagen-cream",
] as const satisfies readonly MethodProductSlug[];

const BEYOND_CORE_PRODUCT_SLUGS = [
  "refine-02-pore-treatment-pads",
  "frame-04-pdrn-eye-cream",
  "lift-06-pdrn-mask-system",
] as const satisfies readonly MethodProductSlug[];

const INGREDIENT_LINK_LABELS: Record<string, string> = {
  pdrn: "PDRN",
  peptides: "Peptides",
  niacinamide: "Niacinamide",
};

function productsForSlugs(
  productsBySlug: ReadonlyMap<string, Product>,
  slugs: readonly MethodProductSlug[],
): Product[] {
  return slugs.flatMap((slug) => {
    const product = productsBySlug.get(slug);
    return product ? [product] : [];
  });
}

function ingredientPreviewLabel(card: IngredientIndexCard) {
  return `Read about ${INGREDIENT_LINK_LABELS[card.id] ?? card.name} in the System`;
}

export default async function HomePage() {
  const products = await getCachedProducts();
  const productsBySlug = new Map(products.map((product) => [product.slug, product]));
  const coreProducts = productsForSlugs(productsBySlug, CORE_PRODUCT_SLUGS);
  const methodProducts = productsForSlugs(
    productsBySlug,
    [
      ...CORE_PRODUCT_SLUGS,
      ...BEYOND_CORE_PRODUCT_SLUGS,
    ],
  );
  const ingredientCards = buildIngredientIndex(methodProducts).slice(0, 3);
  const beyondCoreProducts = productsForSlugs(
    productsBySlug,
    BEYOND_CORE_PRODUCT_SLUGS,
  );

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
            <p className="home-video-hero__eyebrow">Mei Pelle</p>
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
            <HomePlugVideo />
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
              <Link href="#core-three" className="btn btn--editorial-rounded">
                Explore The Core
              </Link>
            </div>
          </article>
        </div>
      </section>

      <HomeBeyondCoreShowcase products={beyondCoreProducts} />

      <section className="home-band home-section" aria-labelledby="ingredients-heading">
        <div className="container home-split home-split--ingredients">
          <div>
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
        <HomeFinalVideo />
        <div className="home-final">
          <h2 id="final-heading" className="display-secondary home-final__title">
            Invest in your skin&apos;s future.
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
