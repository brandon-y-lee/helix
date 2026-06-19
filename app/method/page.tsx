import type { Metadata } from "next";
import Link from "next/link";
import { EditorialHueField } from "@/components/EditorialHueField";
import { MethodRoutineNav } from "@/components/MethodRoutineNav";
import { ProductImage } from "@/components/ProductImage";
import {
  PROTECT_STEP,
  ROUTINE_GROUPS,
  buildIngredientIndex,
  formulaFocus,
  getMethodProductState,
  isAvailableProduct,
  methodProductNavLabel,
  methodProductNumber,
  productSectionId,
  routineProductsForGroup,
  stepCopyForProduct,
} from "@/lib/content/method";
import { getCachedProducts } from "@/lib/catalog-cache";
import type { Product } from "@/lib/products";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "The Mei-Pelle Method | Men's Skincare Routine",
  description:
    "A clear step-by-step skincare system covering cleansing, treatment, hydration, eye care, weekly care, and daily SPF.",
  alternates: {
    canonical: "/method",
  },
  openGraph: {
    title: "The Mei-Pelle Method | Men's Skincare Routine",
    description:
      "A clear step-by-step skincare system covering cleansing, treatment, hydration, eye care, weekly care, and daily SPF.",
    url: "/method",
    siteName: "Mei-Pelle",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Mei-Pelle Method | Men's Skincare Routine",
    description:
      "A clear step-by-step skincare system covering cleansing, treatment, hydration, eye care, weekly care, and daily SPF.",
  },
};

function availabilityLabel(product: Product) {
  if (isAvailableProduct(product)) return "Available";
  if (product.status === "coming_soon") return "Coming soon";
  if (product.status === "sold_out") return "Sold out";
  return "Unavailable";
}

function primaryVariantMeta(product: Product) {
  const variant = product.variants[0];
  if (variant?.volume) return variant.volume;
  if (variant?.packCount) return `${variant.packCount} pack`;
  if (variant?.label) return variant.label;
  return product.volume;
}

function ProductStep({ product }: { product: Product }) {
  const copy = stepCopyForProduct(product);
  const focus = formulaFocus(product);
  const stepNumber = methodProductNumber(product);

  if (!copy) return null;

  return (
    <section
      id={productSectionId(product)}
      className="method-step"
      aria-labelledby={`${productSectionId(product)}-heading`}
    >
      <div className="method-step__media">
        <ProductImage
          media={product.detailMedia ?? product.cardMedia}
          swatch={product.swatch}
          className="method-step__image"
          imageClassName="method-step__img"
          sizes="(max-width: 860px) 92vw, 46vw"
        />
        <span className="method-step__routine">{stepNumber}</span>
      </div>
      <div className="method-step__body">
        <p className="eyebrow">STEP {stepNumber}</p>
        <h2 id={`${productSectionId(product)}-heading`}>
          {product.displayName}
        </h2>
        <p className="method-step__type">
          {product.productType}
          {primaryVariantMeta(product) ? ` / ${primaryVariantMeta(product)}` : ""}
        </p>

        <div className="method-step__grid">
          <article>
            <h3>WHAT</h3>
            <p>{copy.what}</p>
          </article>
          <article>
            <h3>WHY</h3>
            <p>{copy.why}</p>
          </article>
          <article>
            <h3>HOW</h3>
            <p>{product.editorialHowToUse || product.howToUse}</p>
          </article>
          <article>
            <h3>FORMULA FOCUS</h3>
            {focus.length > 0 ? (
              <ul>
                {focus.map((ingredient) => (
                  <li key={ingredient}>{ingredient}</li>
                ))}
              </ul>
            ) : (
              <p>Ingredient notes pending.</p>
            )}
          </article>
        </div>

        <div className="method-step__meta" aria-label={`${product.displayName} metadata`}>
          <span>{product.usageTime.join(" + ") || "Use as directed"}</span>
          <span>{availabilityLabel(product)}</span>
          {product.cautions.length > 0 && <span>Review cautions on PDP</span>}
        </div>

        <Link
          href={`/products/${product.slug}`}
          className="btn btn--ghost method-step__link"
          aria-label={`View ${product.displayName} product details`}
        >
          View {product.displayName}
        </Link>
      </div>
    </section>
  );
}

function ProtectStep() {
  return (
    <section
      id="step-protect"
      className="method-step method-step--protect"
      aria-labelledby="step-protect-heading"
    >
      <div className="method-step__media method-protect__visual" aria-hidden="true">
        <span className="method-step__routine">{PROTECT_STEP.number}</span>
      </div>
      <div className="method-step__body">
        <p className="eyebrow">STEP {PROTECT_STEP.number}</p>
        <h2 id="step-protect-heading">{PROTECT_STEP.displayName}</h2>
        <p className="method-step__type">{PROTECT_STEP.productType}</p>
        <div className="method-step__meta" aria-label="PROTECT status">
          <span>{PROTECT_STEP.status}</span>
        </div>
        <div className="method-step__grid">
          <article>
            <h3>WHAT</h3>
            <p>{PROTECT_STEP.what}</p>
          </article>
          <article>
            <h3>WHY</h3>
            <p>{PROTECT_STEP.why}</p>
          </article>
          <article>
            <h3>HOW</h3>
            <p>{PROTECT_STEP.how}</p>
          </article>
          <article>
            <h3>FORMULA FOCUS</h3>
            <p>{PROTECT_STEP.formulaFocus}</p>
          </article>
        </div>
        <p className="method-step__note">{PROTECT_STEP.note}</p>
      </div>
    </section>
  );
}

export default async function MethodPage() {
  const products = await getCachedProducts();
  const { methodProducts, missingSlugs } = getMethodProductState(products);
  const ingredientCards = buildIngredientIndex(methodProducts);
  const dailyProducts = methodProducts.filter(
    (product) => product.slug !== "lift-06-pdrn-mask-system",
  );
  const liftProducts = methodProducts.filter(
    (product) => product.slug === "lift-06-pdrn-mask-system",
  );
  const navItems = [
    { id: "method-overview", label: "Start", meta: "Protocol" },
    { id: "method-routine", label: "AM / PM", meta: "Timing" },
    ...dailyProducts.map((product) => ({
      id: productSectionId(product),
      label: methodProductNavLabel(product),
      meta: product.routineStep ?? undefined,
    })),
    { id: "step-protect", label: "06 PROTECT", meta: PROTECT_STEP.status },
    ...liftProducts.map((product) => ({
      id: productSectionId(product),
      label: methodProductNavLabel(product),
      meta: product.routineStep ?? undefined,
    })),
    { id: "method-ingredients", label: "Index", meta: "Ingredients" },
  ];

  return (
    <div className="method-page">
      <section
        id="method-overview"
        className="method-hero"
        aria-labelledby="method-heading"
      >
        <EditorialHueField className="method-hero__field" />
        <div className="method-hero__copy">
          <p className="eyebrow">Mei-Pelle</p>
          <h1 id="method-heading">THE METHOD.</h1>
          <p>A system for clearer, healthier, beautiful skin</p>
          <div className="hero__actions">
            <Link href="/products" className="btn">
              Start the system
            </Link>
            <Link href="#method-routine" className="btn btn--ghost">
              View the routine
            </Link>
          </div>
        </div>
      </section>

      {missingSlugs.length > 0 && (
        <section className="container method-missing" aria-labelledby="method-missing-heading">
          <h2 id="method-missing-heading">Method catalog incomplete</h2>
          <p>
            The Method needs live catalog records for every approved step. Missing:
            {" "}
            {missingSlugs.join(", ")}.
          </p>
        </section>
      )}

      {methodProducts.length > 0 && (
        <div className="method-shell">
          <MethodRoutineNav items={navItems} />

          <div className="method-flow">
            <section
              id="method-routine"
              className="method-routine"
              aria-labelledby="method-routine-heading"
            >
              <div className="section-head">
                <div>
                  <p className="eyebrow">WHAT / WHY / HOW</p>
                  <h2 id="method-routine-heading">Run the routine by timing.</h2>
                </div>
              </div>

              <div className="method-routine__grid">
                {ROUTINE_GROUPS.map((group) => {
                  const entries = routineProductsForGroup(group.entries, methodProducts);
                  return (
                    <article
                      key={group.id}
                      id={`routine-${group.id}`}
                      className="routine-card"
                    >
                      <p>{group.label}</p>
                      <h3>{group.heading}</h3>
                      <span>{group.summary}</span>
                      <ol>
                        {entries.map((entry) => (
                          <li
                            key={`${group.id}-${entry.kind === "product" ? entry.slug : entry.id}`}
                          >
                            <span>{entry.number}</span>
                            {entry.kind === "product" ? (
                              entry.product ? (
                                <Link href={`#${productSectionId(entry.product)}`}>
                                  {entry.product.displayName}
                                  {entry.note && <small>{entry.note}</small>}
                                </Link>
                              ) : (
                                <em>Missing catalog step: {entry.slug}</em>
                              )
                            ) : (
                              <Link href="#step-protect">
                                {entry.label}
                                <small>{entry.note}</small>
                              </Link>
                            )}
                          </li>
                        ))}
                      </ol>
                    </article>
                  );
                })}
              </div>
            </section>

            <div className="method-steps" aria-label="Method product steps">
              {dailyProducts.map((product) => (
                <ProductStep key={product.slug} product={product} />
              ))}
              <ProtectStep />
              {liftProducts.map((product) => (
                <ProductStep key={product.slug} product={product} />
              ))}
            </div>

            <section
              id="method-ingredients"
              className="method-ingredients"
              aria-labelledby="method-ingredients-heading"
            >
              <div className="section-head">
                <div>
                  <h2 id="method-ingredients-heading">KNOW WHAT YOU’RE USING.</h2>
                </div>
              </div>
              <div className="ingredient-index">
                {ingredientCards.map((card) => (
                  <article key={card.id} className="ingredient-card">
                    <p>{card.ingredientClass}</p>
                    <h3>{card.name}</h3>
                    <dl className="ingredient-card__fields">
                      <div>
                        <dt>INCI / IDENTITY</dt>
                        <dd>{card.identity}</dd>
                      </div>
                      <div>
                        <dt>MECHANISM</dt>
                        <dd>{card.mechanism}</dd>
                      </div>
                      <div>
                        <dt>SKIN RELEVANCE</dt>
                        <dd>{card.skinRelevance}</dd>
                      </div>
                      {card.formulationNote && (
                        <div>
                          <dt>FORMULATION NOTE</dt>
                          <dd>{card.formulationNote}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="ingredient-card__found">
                      <strong>FOUND IN</strong>
                      <ul aria-label={`${card.name} products`}>
                        {card.products.map((product) => (
                          <li key={`${card.id}-${product.slug}`}>
                            <Link href={`/products/${product.slug}`}>
                              {product.displayName}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="editorial-cta method-cta" aria-labelledby="method-cta-heading">
              <p className="eyebrow">Build deliberately</p>
              <h2 id="method-cta-heading">CLEAR STEPS. NO WASTED MOTION.</h2>
              <div className="hero__actions">
                <Link href="/products" className="btn">
                  Build the system
                </Link>
                <Link href="/about" className="btn btn--ghost">
                  About Mei-Pelle
                </Link>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
