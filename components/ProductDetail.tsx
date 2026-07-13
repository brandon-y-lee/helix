"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { ProductImage } from "@/components/ProductImage";
import { WaitlistButton } from "@/components/WaitlistButton";
import {
  getProductPdpContent,
  type ProductPdpContent,
} from "@/lib/catalog/product-content";
import {
  routineDisplayLabelForProduct,
  routineGroupLabelForProduct,
  routineSortForProduct,
} from "@/lib/catalog/product-routine";
import {
  getProductReviews,
  reviewSummary,
  type ProductReviews,
} from "@/lib/catalog/product-reviews";
import { formatPrice, type Product, type ProductMedia } from "@/lib/products";
import type { CartPlaceholderMedia } from "@/lib/cart/types";

function fallbackGalleryPanels(swatch: [string, string]): Array<[string, string]> {
  const [a, b] = swatch;
  return [
    [a, b],
    [b, a],
    [a, a],
    [b, b],
  ];
}

function cartPlaceholderMedia(
  media: ProductMedia | null | undefined,
): CartPlaceholderMedia {
  if (media?.kind !== "placeholder" || !media.palette) return null;
  return {
    kind: "placeholder",
    alt: media.alt,
    paletteId: media.paletteId,
    palette: media.palette,
  };
}

type PurchaseAccordionId = "does" | "use" | "ingredients";

function compactDescription(value: string) {
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return (sentences.length ? sentences.slice(0, 2).join(" ") : value).trim();
}

function availabilityLabel(
  product: Product,
  variant: Product["variants"][number] | undefined,
) {
  if (product.status === "coming_soon") return "Coming soon";
  if (product.status === "sold_out") return "Sold out";
  if (!variant?.available || variant.inventoryStatus === "unavailable") {
    return "Unavailable";
  }
  if (variant.inventoryStatus === "out_of_stock") return "Out of stock";
  if (variant.inventoryStatus === "low_stock") return "Low stock";
  return "Available";
}

function productPriceLabel(product: Product) {
  const prices = product.variants.map((variant) => variant.price);
  if (prices.length === 0) return "—";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatPrice(min) : `From ${formatPrice(min)}`;
}

function splitCopy(value: string) {
  return value
    .split(/[.;]\s+/)
    .map((item) => item.trim().replace(/[.;]$/, ""))
    .filter(Boolean);
}

function ProductSignalGrid({
  product,
  routineLabel,
}: {
  product: Product;
  routineLabel: string;
}) {
  const signals = [
    { label: "GOOD FOR", value: product.goodFor },
    { label: "FEELS LIKE", value: product.texture },
    { label: "FINISH", value: product.finish },
    { label: "WHEN TO USE", value: product.usageTime.join(" / ") },
    { label: "WHERE IT FITS", value: routineLabel },
  ].filter((signal): signal is { label: string; value: string } =>
    Boolean(signal.value),
  );

  if (signals.length === 0) return null;

  return (
    <section className="pdp-section pdp-section--signals" aria-labelledby="pdp-signals-heading">
      <h2 id="pdp-signals-heading">QUICK SIGNALS</h2>
      <dl className="product-signal-grid">
        {signals.map((signal) => (
          <div key={signal.label} className="product-signal-grid__item">
            <dt>{signal.label}</dt>
            <dd>{signal.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ReviewResponseMeter({
  reviews,
}: {
  reviews: ProductReviews;
}) {
  const values = reviews.reviews.map((review) => review.meterValue);
  const value = values.length
    ? Math.round(values.reduce((sum, item) => sum + item, 0) / values.length)
    : 0;

  return (
    <div className="review-meter">
      <p>{reviews.meter.question}</p>
      <div className="review-meter__track">
        <span>{reviews.meter.lowLabel}</span>
        <meter min={0} max={100} value={value} aria-label={`${reviews.meter.question}: ${value} out of 100`} />
        <span>{reviews.meter.highLabel}</span>
      </div>
    </div>
  );
}

function ProductReviewsSection({
  product,
  reviews,
}: {
  product: Product;
  reviews: ProductReviews;
}) {
  if (reviews.reviews.length === 0) return null;
  const summary = reviewSummary(reviews.reviews);

  return (
    <section className="pdp-reviews" aria-labelledby="pdp-reviews-heading">
      <div className="section-head">
        <p className="eyebrow">Routine responses</p>
        <h2 id="pdp-reviews-heading">EARLY READS</h2>
        <p>
          Original Mei Pelle response cards for {product.displayName}; public
          review intake is not open yet.
        </p>
      </div>
      <div className="pdp-reviews__summary">
        <strong>{summary.average.toFixed(1)}</strong>
        <span>{summary.count} response cards</span>
      </div>
      <ReviewResponseMeter reviews={reviews} />
      <div className="pdp-reviews__grid">
        {reviews.reviews.map((review) => (
          <article key={review.id} className="review-card">
            <div className="review-card__head">
              <span aria-hidden="true">{review.initials}</span>
              <div>
                <h3>{review.title}</h3>
                <p>
                  {review.firstName} · {review.ageRange} · {review.skinType}
                </p>
              </div>
            </div>
            <p className="review-card__rating" aria-label={`${review.rating} out of 5 stars`}>
              {"★".repeat(review.rating)}
              {"☆".repeat(5 - review.rating)}
            </p>
            <p>{review.body}</p>
            <dl className="review-card__meta">
              <div>
                <dt>Concern</dt>
                <dd>{review.primaryConcern}</dd>
              </div>
              <div>
                <dt>Routine</dt>
                <dd>{review.routineContext}</dd>
              </div>
              <div>
                <dt>Favorite</dt>
                <dd>{review.favoriteFeatures.join(", ")}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{review.date}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductDiscoveryRail({
  current,
  products,
}: {
  current: Product;
  products: Product[];
}) {
  const railRef = useRef<HTMLUListElement>(null);
  const sorted = useMemo(
    () =>
      products
        .filter((product) => product.slug !== current.slug)
        .slice()
        .sort((a, b) => routineSortForProduct(a) - routineSortForProduct(b)),
    [current.slug, products],
  );

  if (sorted.length === 0) return null;

  function scroll(direction: "previous" | "next") {
    railRef.current?.scrollBy({
      left: direction === "previous" ? -360 : 360,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  return (
    <section className="pdp-discovery" aria-labelledby="pdp-discovery-heading">
      <div className="section-head">
        <p className="eyebrow">Discovery</p>
        <h2 id="pdp-discovery-heading">BUILD AROUND THIS STEP</h2>
        <p>Core products first, then the focused additions beyond it.</p>
      </div>
      <div className="pdp-discovery__controls" aria-label="Product rail controls">
        <button type="button" onClick={() => scroll("previous")} aria-label="Previous products">
          ←
        </button>
        <button type="button" onClick={() => scroll("next")} aria-label="Next products">
          →
        </button>
      </div>
      <ul ref={railRef} className="pdp-discovery__rail">
        {sorted.map((product) => (
          <li key={product.slug} className="pdp-discovery-card">
            <Link href={`/products/${product.slug}`}>
              <ProductImage
                media={product.cardMedia}
                swatch={product.swatch}
                className="pdp-discovery-card__media"
                imageClassName="pdp-discovery-card__img"
                sizes="(max-width: 720px) 70vw, 280px"
              />
              <span className="pdp-discovery-card__routine">
                {routineDisplayLabelForProduct(product)}
              </span>
              <strong>{product.displayName}</strong>
              <small>{product.cardTagline}</small>
              <em>{productPriceLabel(product)}</em>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProductDetail({
  product,
  related = [],
  content = getProductPdpContent(product.slug),
  reviews = getProductReviews(product.slug),
}: {
  product: Product;
  related?: Product[];
  content?: ProductPdpContent;
  reviews?: ProductReviews;
}) {
  const { add } = useCart();
  const fallbackPanels = fallbackGalleryPanels(product.swatch);
  const gallery = product.media.filter((media) =>
    ["detail", "gallery", "card_default"].includes(media.role),
  );
  const panelCount = gallery.length || fallbackPanels.length;
  const [activePanel, setActivePanel] = useState(0);
  const [variantId, setVariantId] = useState(product.variants[0]?.id);
  const [added, setAdded] = useState(false);
  const [pending, setPending] = useState(false);
  const [addError, setAddError] = useState("");
  const [openAccordion, setOpenAccordion] =
    useState<PurchaseAccordionId | null>(null);
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  const [bottomVisible, setBottomVisible] = useState(false);
  const purchaseCtaRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLSpanElement>(null);

  const variant =
    product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const isAvailable =
    product.status === "available" &&
    Boolean(
      variant?.available &&
        variant.inventoryStatus !== "out_of_stock" &&
        variant.inventoryStatus !== "unavailable",
    );
  const activeMedia = gallery[activePanel] ?? product.detailMedia;
  const activeSwatch = fallbackPanels[activePanel % fallbackPanels.length];
  const routineLabel = routineDisplayLabelForProduct(product);
  const routineGroupLabel = routineGroupLabelForProduct(product);
  const leadDescription = compactDescription(
    product.editorialDescription || product.description || product.cardTagline,
  );
  const availability = availabilityLabel(product, variant);
  const keyIngredients = product.keyIngredients.slice(0, 5);
  const howToUse = content.howToUseSteps.length
    ? content.howToUseSteps
    : splitCopy(product.editorialHowToUse || product.howToUse);
  const fullIngredientsText =
    product.ingredients ||
    product.productDetails.sourceFullInci ||
    "The current full ingredient list should be checked on product packaging or the approved product source.";
  const details = [
    { label: "Routine placement", value: routineLabel },
    { label: "Routine group", value: routineGroupLabel },
    { label: "Product type", value: product.productType },
    { label: "Use cadence", value: product.usageTime.join(" / ") },
    { label: "Availability", value: availability },
    { label: "Texture", value: product.texture },
    { label: "Finish", value: product.finish },
    { label: "Size", value: variant?.volume ?? product.volume },
    {
      label: "Pack count",
      value: variant?.packCount ? String(variant.packCount) : "",
    },
    { label: "Made for", value: product.madeFor },
    { label: "Good for", value: product.goodFor },
    { label: "Skin", value: product.skinTypes.join(", ") },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
  const stickyVisible = !heroCtaVisible && !bottomVisible;

  useEffect(() => {
    const cta = purchaseCtaRef.current;
    const bottom = bottomSentinelRef.current;
    if (!cta || !bottom || !("IntersectionObserver" in window)) return;

    const ctaObserver = new IntersectionObserver(
      ([entry]) => setHeroCtaVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.08 },
    );
    const bottomObserver = new IntersectionObserver(
      ([entry]) => setBottomVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: "0px 0px -12% 0px", threshold: 0.01 },
    );

    ctaObserver.observe(cta);
    bottomObserver.observe(bottom);
    return () => {
      ctaObserver.disconnect();
      bottomObserver.disconnect();
    };
  }, []);

  async function handleAdd() {
    if (!variant || !isAvailable || pending) return;
    setPending(true);
    setAddError("");
    const media = product.cartMedia ?? product.cardMedia;
    const ok = await add({
      slug: product.slug,
      name: product.displayName,
      variantId: variant.id,
      variantLabel: variant.label,
      price: variant.price,
      swatch: product.swatch,
      imageUrl: null,
      imageAlt: media?.alt ?? null,
      placeholderMedia: cartPlaceholderMedia(media),
    });
    setPending(false);
    if (ok) {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 2200);
    } else {
      setAddError("Cart is temporarily unavailable. Try again in a moment.");
    }
  }

  function toggleAccordion(id: PurchaseAccordionId) {
    setOpenAccordion((current) => (current === id ? null : id));
  }

  return (
    <>
      <div className="pdp">
        <div className="pdp__gallery">
          <ProductImage
            media={activeMedia}
            swatch={activeSwatch}
            className="pdp__media"
            imageClassName="pdp__img"
            sizes="(max-width: 860px) 92vw, 56vw"
            priority
          />
          <div
            className="pdp__thumbs"
            role="group"
            aria-label="Product hue views"
          >
            {Array.from({ length: panelCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                className="pdp__thumb"
                aria-pressed={i === activePanel}
                aria-label={`View hue ${i + 1} of ${panelCount}`}
                onClick={() => setActivePanel(i)}
              >
                <ProductImage
                  media={gallery[i] ?? null}
                  swatch={fallbackPanels[i % fallbackPanels.length]}
                  className="pdp__thumb-image"
                  imageClassName="pdp__thumb-img"
                  sizes="96px"
                />
              </button>
            ))}
          </div>
        </div>

        <div className="pdp__purchase">
          <p className="pdp__collection">{routineLabel}</p>
          <h1>{product.displayName}</h1>
          <p className="pdp__tagline">{product.cardTagline}</p>
          <p className="pdp__description">{leadDescription}</p>
          <p className="pdp__price">
            {variant ? formatPrice(variant.price) : "—"}
          </p>

          {product.variants.length > 0 && (
            <>
              <span className="field-label" id="size-label">
                Size
              </span>
              <div
                className="variant-options"
                role="group"
                aria-labelledby="size-label"
              >
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="variant-option"
                    aria-pressed={v.id === variantId}
                    disabled={!v.available}
                    onClick={() => setVariantId(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="pdp__availability" role="status">
            {availability}
          </p>

          <div ref={purchaseCtaRef} className="pdp__actions">
            {isAvailable && variant ? (
              <button
                type="button"
                className="btn"
                onClick={() => void handleAdd()}
                disabled={pending}
              >
                {pending ? "Adding" : `Add to cart — ${formatPrice(variant.price)}`}
              </button>
            ) : (
              <WaitlistButton className="btn" label="Join the waitlist" />
            )}
          </div>
          <p className="add-feedback" role="status" aria-live="polite">
            {added ? "Added to cart" : addError}
          </p>

          <div className="pdp-accordions" aria-label={`${product.displayName} purchase details`}>
            <section className="pdp-accordion">
              <h2 className="pdp-accordion__heading">
                <button
                  type="button"
                  className="pdp-accordion__trigger"
                  id="pdp-accordion-does-trigger"
                  aria-expanded={openAccordion === "does"}
                  aria-controls="pdp-accordion-does-panel"
                  onClick={() => toggleAccordion("does")}
                >
                  <span>WHAT IT DOES</span>
                  <span aria-hidden="true">{openAccordion === "does" ? "-" : "+"}</span>
                </button>
              </h2>
              <div
                id="pdp-accordion-does-panel"
                className="pdp-accordion__panel"
                data-open={openAccordion === "does"}
                role="region"
                aria-labelledby="pdp-accordion-does-trigger"
                aria-hidden={openAccordion !== "does"}
              >
                <div className="pdp-accordion__content">
                  <ul>
                    {content.whatItDoes.map((benefit) => (
                      <li key={benefit}>{benefit}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section className="pdp-accordion">
              <h2 className="pdp-accordion__heading">
                <button
                  type="button"
                  className="pdp-accordion__trigger"
                  id="pdp-accordion-use-trigger"
                  aria-expanded={openAccordion === "use"}
                  aria-controls="pdp-accordion-use-panel"
                  onClick={() => toggleAccordion("use")}
                >
                  <span>HOW TO USE</span>
                  <span aria-hidden="true">{openAccordion === "use" ? "-" : "+"}</span>
                </button>
              </h2>
              <div
                id="pdp-accordion-use-panel"
                className="pdp-accordion__panel"
                data-open={openAccordion === "use"}
                role="region"
                aria-labelledby="pdp-accordion-use-trigger"
                aria-hidden={openAccordion !== "use"}
              >
                <div className="pdp-accordion__content">
                  <ol>
                    {howToUse.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {product.cautions.length > 0 && (
                    <p className="pdp-accordion__note">
                      Check cautions before use.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="pdp-accordion">
              <h2 className="pdp-accordion__heading">
                <button
                  type="button"
                  className="pdp-accordion__trigger"
                  id="pdp-accordion-ingredients-trigger"
                  aria-expanded={openAccordion === "ingredients"}
                  aria-controls="pdp-accordion-ingredients-panel"
                  onClick={() => toggleAccordion("ingredients")}
                >
                  <span>KEY INGREDIENTS</span>
                  <span aria-hidden="true">
                    {openAccordion === "ingredients" ? "-" : "+"}
                  </span>
                </button>
              </h2>
              <div
                id="pdp-accordion-ingredients-panel"
                className="pdp-accordion__panel"
                data-open={openAccordion === "ingredients"}
                role="region"
                aria-labelledby="pdp-accordion-ingredients-trigger"
                aria-hidden={openAccordion !== "ingredients"}
              >
                <div className="pdp-accordion__content">
                  {keyIngredients.length > 0 ? (
                    <ul className="pdp-key-ingredients">
                      {keyIngredients.map((ingredient) => (
                        <li key={ingredient}>{ingredient}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      Key ingredient notes are not available for this product yet.
                    </p>
                  )}
                  <a
                    href="#full-ingredients"
                    tabIndex={openAccordion === "ingredients" ? undefined : -1}
                  >
                    View full ingredients
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div
        className="pdp-sticky-purchase"
        data-visible={stickyVisible}
        aria-hidden={!stickyVisible}
      >
        <div>
          <span>{routineLabel}</span>
          <strong>{product.displayName}</strong>
          <small>{variant?.label ?? product.productType}</small>
        </div>
        <span>{variant ? formatPrice(variant.price) : "—"}</span>
        {isAvailable && variant ? (
          <button
            type="button"
            className="btn"
            onClick={() => void handleAdd()}
            disabled={pending}
            tabIndex={stickyVisible ? undefined : -1}
          >
            {pending ? "Adding" : "Add"}
          </button>
        ) : (
          <WaitlistButton
            className="btn"
            label="Waitlist"
            tabIndex={stickyVisible ? undefined : -1}
          />
        )}
      </div>

      <section className="pdp-sections" aria-label={`${product.displayName} details`}>
        <ProductSignalGrid product={product} routineLabel={routineLabel} />

        <section className="pdp-section pdp-section--does" aria-labelledby="pdp-does-heading">
          <h2 id="pdp-does-heading">WHAT IT DOES</h2>
          <ul className="pdp-goals">
            {content.whatItDoes.map((goal) => (
              <li key={goal}>{goal}</li>
            ))}
          </ul>
        </section>

        <section className="pdp-section pdp-section--use" aria-labelledby="pdp-use-heading">
          <h2 id="pdp-use-heading">HOW TO USE</h2>
          <ol className="pdp-use-steps">
            {howToUse.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="pdp-section pdp-section--inside" aria-labelledby="pdp-inside-heading">
          <h2 id="pdp-inside-heading">WHAT&apos;S INSIDE</h2>
          {content.ingredientCards.length > 0 ? (
            <div className="ingredient-card-row">
              {content.ingredientCards.map((ingredient) => (
                <article key={ingredient.name} className="ingredient-card">
                  <span>{ingredient.label}</span>
                  <h3>{ingredient.name}</h3>
                  <p>{ingredient.copy}</p>
                </article>
              ))}
            </div>
          ) : (
            <p>Ingredient notes are not available for this product yet.</p>
          )}
        </section>

        <section className="pdp-section pdp-section--ingredients" aria-labelledby="full-ingredients-heading">
          <h2 id="full-ingredients-heading">INGREDIENTS</h2>
          <details id="full-ingredients" className="full-ingredients">
            <summary>Full ingredients</summary>
            <p>{fullIngredientsText}</p>
          </details>
        </section>

        {details.length > 0 && (
          <section className="pdp-section" aria-labelledby="product-details">
            <h2 id="product-details">DETAILS</h2>
            <dl className="meta-grid">
              {details.map((m) => (
                <div key={m.label} className="meta-grid__item">
                  <dt>{m.label}</dt>
                  <dd>{m.value}</dd>
                </div>
              ))}
            </dl>
            {product.cautions.length > 0 && (
              <div className="pdp-disclosures">
                <details>
                  <summary>Cautions</summary>
                  <ul>
                    {product.cautions.map((caution) => (
                      <li key={caution}>{caution}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </section>
        )}
      </section>

      <ProductDiscoveryRail current={product} products={related} />
      <ProductReviewsSection product={product} reviews={reviews} />
      <span ref={bottomSentinelRef} className="pdp-bottom-sentinel" aria-hidden="true" />
    </>
  );
}
