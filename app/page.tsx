import type { Metadata } from "next";
import Link from "next/link";
import { HomeFinalVideo } from "@/components/HomeFinalVideo";
import { HomeHeroVideo } from "@/components/HomeHeroVideo";
import { HomePlugVideo } from "@/components/HomePlugVideo";
import { HomeWhyPortrait } from "@/components/HomeWhyPortrait";
import { ProductGrid } from "@/components/ProductGrid";
import { ProductImage } from "@/components/ProductImage";
import { getCachedProducts } from "@/lib/catalog-cache";
import {
  PROTECT_STEP,
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

type ProductAddOn = {
  kind: "product";
  slug: MethodProductSlug;
  displayName: "REFINE" | "FRAME" | "LIFT";
  role: string;
  summary: string;
};

type ProtectAddOn = {
  kind: "protect";
  displayName: "PROTECT";
  role: string;
  summary: string;
};

type AddOn = ProductAddOn | ProtectAddOn;

const CORE_PRODUCT_SLUGS = [
  "cleanse-01-calming-gel-cleanser",
  "treat-03-pdrn-5-ampoule",
  "seal-05-green-collagen-cream",
] as const satisfies readonly MethodProductSlug[];

const ADD_ONS: readonly AddOn[] = [
  {
    kind: "product",
    slug: "refine-02-pore-treatment-pads",
    displayName: "REFINE",
    role: "texture / controlled refinement",
    summary:
      "A frequency-dependent texture step for visible unevenness when the baseline is already consistent.",
  },
  {
    kind: "product",
    slug: "frame-04-pdrn-eye-cream",
    displayName: "FRAME",
    role: "eye area / rested-looking frame",
    summary:
      "A smaller-dose eye-area step for a more rested-looking frame around the face.",
  },
  {
    kind: "protect",
    displayName: "PROTECT",
    role: "SPF finish / final morning protection / coming soon editorial step",
    summary:
      "A non-commerce System step for broad-spectrum SPF as the final morning layer.",
  },
  {
    kind: "product",
    slug: "lift-06-pdrn-mask-system",
    displayName: "LIFT",
    role: "weekly intensive",
    summary:
      "A scheduled weekly intensive for the days you want more than the daily baseline.",
  },
] as const;

const WHY_THREE_STATEMENTS = [
  "01 Start with structure skin understands.",
  "02 Most routines fail because they ask for too much too soon.",
  "03 Three steps build consistency.",
] as const;

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

function renderProductAddOn(addOn: ProductAddOn, product: Product) {
  return (
    <Link
      key={addOn.displayName}
      href={`/products/${product.slug}`}
      className="home-addon-card"
      aria-label={`View ${product.displayName}, ${addOn.role}`}
    >
      <ProductImage
        media={product.cardMedia}
        swatch={product.swatch}
        className="home-addon-card__media"
        imageClassName="home-addon-card__img"
        sizes="(max-width: 720px) 84vw, 260px"
      />
      <span className="home-addon-card__label">{product.displayName}</span>
      <h3>{`${product.displayName} — ${addOn.role}`}</h3>
      <p>{addOn.summary}</p>
    </Link>
  );
}

function renderProtectAddOn(addOn: ProtectAddOn) {
  return (
    <Link
      key={addOn.displayName}
      href="/system#system-protect"
      className="home-addon-card home-addon-card--protect"
      aria-label="View PROTECT System step, coming soon"
    >
      <span className="home-addon-card__media home-addon-card__media--protect" aria-hidden="true">
        <span>SPF</span>
      </span>
      <span className="home-addon-card__label">{PROTECT_STEP.status}</span>
      <h3>{`${addOn.displayName} — ${addOn.role}`}</h3>
      <p>{addOn.summary}</p>
    </Link>
  );
}

function renderAddOn(addOn: AddOn, productsBySlug: ReadonlyMap<string, Product>) {
  if (addOn.kind === "protect") return renderProtectAddOn(addOn);

  const product = productsBySlug.get(addOn.slug);
  if (!product) return null;

  return renderProductAddOn(addOn, product);
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
      ...ADD_ONS.flatMap((addOn) => (addOn.kind === "product" ? [addOn.slug] : [])),
    ],
  );
  const ingredientCards = buildIngredientIndex(methodProducts).slice(0, 3);

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
              Prestige skin starts with three steps.
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

      <section
        id="core-three"
        className="container home-section home-section--core"
        aria-labelledby="core-three-heading"
      >
        <div className="home-section__intro home-section__intro--core">
          <p className="hero__eyebrow">The Core</p>
          <h2 id="core-three-heading" className="sr-only">The Core</h2>
          <p>
            Simple by design: cleanse the surface, apply the treatment
            layer, then finish with moisture and barrier support.
          </p>
        </div>

        {coreProducts.length > 0 && (
          <ProductGrid products={coreProducts} className="product-grid home-core-products" />
        )}
      </section>

      <section className="home-section home-section--why" aria-labelledby="why-three-heading">
        <div className="home-why-principles">
          <h2 id="why-three-heading" className="home-plug-panel__title">Simple is <br />not basic</h2>
          <ol className="home-why-list" aria-label="Why three works">
            {WHY_THREE_STATEMENTS.map((statement) => (
              <li key={statement}>{statement}</li>
            ))}
          </ol>
        </div>
        <div className="home-why-visual">
          <HomeWhyPortrait />
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

      <section className="container home-section" aria-labelledby="beyond-heading">
        <div className="home-section__intro home-section__intro--wide">
          <p className="hero__eyebrow">Beyond The Core</p>
          <h2 id="beyond-heading" className="sr-only">Beyond The Core</h2>

          <p>For when your skin has a high baseline. Add what you need.</p>
        </div>
        <div className="home-addon-grid">
          {ADD_ONS.map((addOn) => renderAddOn(addOn, productsBySlug))}
        </div>
      </section>

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
          <h2 id="final-heading">Invest in your skin&apos;s future.</h2>
          <p>
            Three steps, one order, repeatable morning or night.
          </p>
          <div className="hero__actions">
            <Link href="#core-three" className="btn btn--editorial-rounded">
              SHOP THE CORE
            </Link>
            <Link href="/system" className="btn btn--ghost btn--editorial-rounded">
              SEE THE SYSTEM
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
