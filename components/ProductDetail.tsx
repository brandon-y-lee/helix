"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { AfterpayMessaging } from "@/components/AfterpayMessaging";
import { useCart } from "@/components/CartProvider";
import { ProductEndorsementRail } from "@/components/ProductEndorsementRail";
import { ProductImage } from "@/components/ProductImage";
import { ProductReviewsSection } from "@/components/ProductReviewsSection";
import { PdpApplicationCarousel } from "@/components/PdpApplicationCarousel";
import { PdpCoreRoutineSection } from "@/components/PdpCoreRoutineSection";
import { PdpIngredientsSplit } from "@/components/PdpIngredientsSplit";
import { PdpOutcomeSplit } from "@/components/PdpOutcomeSplit";
import { PdpProfileSplit } from "@/components/PdpProfileSplit";
import { PdpRoutineVideo } from "@/components/PdpRoutineVideo";
import { WaitlistButton } from "@/components/WaitlistButton";
import {
  getProductPdpContent,
  type ProductPdpContent,
} from "@/lib/catalog/product-content";
import { resolveFullInci } from "@/lib/catalog/product-ingredients";
import {
  routineDisplayLabelForProduct,
  routineGroupLabelForProduct,
} from "@/lib/catalog/product-routine";
import {
  getProductReviews,
  type ProductReviews,
} from "@/lib/catalog/product-reviews";
import { getCorePdpPresentation } from "@/lib/content/core-pdp";
import {
  formatPrice,
  type CoreRoutineProduct,
  type Product,
  type ProductMedia,
} from "@/lib/products";
import type { CartPlaceholderMedia } from "@/lib/cart/types";
import { productEndorsementMedia } from "@/lib/content/product-endorsements";

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

type PurchaseAccordionId = "use" | "ingredients";

type PdpSequenceItem = {
  kicker: string;
  title: string;
  body: string;
};

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

function splitCopy(value: string) {
  return value
    .split(/[.;]\s+/)
    .map((item) => item.trim().replace(/[.;]$/, ""))
    .filter(Boolean);
}

function galleryRoleRank(role: ProductMedia["role"]) {
  if (role === "detail" || role === "hero") return 0;
  if (role === "gallery") return 1;
  if (role === "card_default" || role === "card") return 2;
  return 3;
}

function normalizedMediaUrl(url: string) {
  try {
    const base = "https://mei-pelle.invalid";
    const parsed = new URL(url, base);
    const origin = parsed.origin === base ? "" : parsed.origin.toLowerCase();
    const pathname = parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
    return `${origin}${pathname}`;
  } catch {
    return url.split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/").replace(/\/$/, "");
  }
}

function galleryMediaIdentity(media: ProductMedia) {
  if (media.url) {
    return `${media.kind}:${normalizedMediaUrl(media.url)}`;
  }

  const palette = media.palette;
  return [
    media.kind,
    media.paletteId ?? "",
    palette?.start ?? "",
    palette?.end ?? "",
    palette?.accent ?? "",
    palette?.surface ?? "",
    palette?.ink ?? "",
    palette?.highlight ?? "",
  ].join(":");
}

function selectGalleryMedia(media: ProductMedia[]) {
  const identities = new Set<string>();

  return media
    .filter(
      (item) =>
        item.kind !== "video" &&
        ["detail", "gallery", "hero", "card_default"].includes(item.role),
    )
    .slice()
    .sort(
      (a, b) =>
        galleryRoleRank(a.role) - galleryRoleRank(b.role) ||
        a.sortOrder - b.sortOrder,
    )
    .filter((item) => {
      const identity = galleryMediaIdentity(item);
      if (identities.has(identity)) return false;
      identities.add(identity);
      return true;
    });
}

function cartImageUrl(media: ProductMedia | null | undefined) {
  return media?.kind === "image" ? media.url : null;
}

function formatSequencePosition(index: number, total: number) {
  const width = Math.max(2, String(total).length);
  return `${String(index + 1).padStart(width, "0")} / ${String(total).padStart(width, "0")}`;
}

function PdpEditorialPair({
  headingId,
  eyebrow,
  heading,
  summary,
  className = "",
  children,
}: {
  headingId: string;
  eyebrow: string;
  heading: string;
  summary?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`pdp-editorial-pair ${className}`.trim()}
      aria-labelledby={headingId}
      data-pdp-panel-row="editorial"
      data-pdp-panel-mode="independent"
    >
      <div
        className="pdp-editorial-pair__panel pdp-editorial-pair__panel--headline"
        data-pdp-panel
        data-pdp-panel-kind="copy"
      >
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={headingId}>{heading}</h2>
        {summary && <p>{summary}</p>}
      </div>
      <div
        className="pdp-editorial-pair__panel pdp-editorial-pair__panel--content"
        data-pdp-panel
        data-pdp-panel-kind="copy"
      >
        {children}
      </div>
    </section>
  );
}

function PdpPanelSequence({
  label,
  items,
}: {
  label: string;
  items: PdpSequenceItem[];
}) {
  const [active, setActive] = useState(0);
  const pointerStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const lastWheelAtRef = useRef(Number.NEGATIVE_INFINITY);
  const lastIndex = Math.max(items.length - 1, 0);
  const canPrevious = active > 0;
  const canNext = active < lastIndex;

  useEffect(() => {
    setActive((current) => Math.min(current, lastIndex));
  }, [lastIndex]);

  function go(delta: -1 | 1) {
    setActive((current) => Math.min(Math.max(current + delta, 0), lastIndex));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) {
      return;
    }
    go(deltaX < 0 ? 1 : -1);
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 10) {
      return;
    }
    event.preventDefault();
    const now = window.performance.now();
    if (now - lastWheelAtRef.current < 260) return;
    lastWheelAtRef.current = now;
    go(event.deltaX > 0 ? 1 : -1);
  }

  if (items.length === 0) return null;

  return (
    <div
      className="pdp-panel-sequence"
      role="group"
      aria-label={label}
      tabIndex={0}
      data-can-previous={canPrevious}
      data-can-next={canNext}
      data-preview-direction={canNext ? "next" : canPrevious ? "previous" : "none"}
      onKeyDown={handleKeyDown}
    >
      <div className="pdp-panel-sequence__bar">
        <span
          className="pdp-panel-sequence__count"
          aria-label={`${label} item position`}
          aria-live="polite"
        >
          {formatSequencePosition(active, items.length)}
        </span>
        <span className="pdp-panel-sequence__controls">
          <button
            type="button"
            aria-label={`Previous ${label}`}
            disabled={!canPrevious}
            onClick={() => go(-1)}
          >
            &larr;
          </button>
          <button
            type="button"
            aria-label={`Next ${label}`}
            disabled={!canNext}
            onClick={() => go(1)}
          >
            &rarr;
          </button>
        </span>
      </div>
      <div
        className="pdp-panel-sequence__viewport"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerStartRef.current = null;
        }}
        onWheel={handleWheel}
      >
        <div
          className="pdp-panel-sequence__track"
          style={{ "--pdp-sequence-offset": `${active * -100}%` } as CSSProperties}
        >
          {items.map((item, index) => (
            <article
              key={`${item.kicker}-${item.title}`}
              className="pdp-panel-sequence__item"
              data-active={index === active}
              aria-hidden={index !== active}
            >
              <span>{item.kicker}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
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
    <PdpEditorialPair
      headingId="pdp-signals-heading"
      eyebrow="Read"
      heading="QUICK SIGNALS"
      summary={`${product.displayName} at a glance, from use timing to finish.`}
      className="pdp-editorial-pair--signals"
    >
      <dl className="product-signal-grid">
        {signals.map((signal) => (
          <div key={signal.label} className="product-signal-grid__item">
            <dt>{signal.label}</dt>
            <dd>{signal.value}</dd>
          </div>
        ))}
      </dl>
    </PdpEditorialPair>
  );
}

export function ProductDetail({
  product,
  coreRoutine = [],
  content = getProductPdpContent(product.slug),
  reviews = getProductReviews(product.slug),
  stripePublishableKey = null,
}: {
  product: Product;
  coreRoutine?: CoreRoutineProduct[];
  content?: ProductPdpContent;
  reviews?: ProductReviews;
  stripePublishableKey?: string | null;
}) {
  const { add } = useCart();
  const fallbackPanels = fallbackGalleryPanels(product.swatch);
  const gallery = useMemo(
    () => selectGalleryMedia(product.media),
    [product.media],
  );
  const panelCount = gallery.length || fallbackPanels.length;
  const [activePanel, setActivePanel] = useState(0);
  const [variantId, setVariantId] = useState(product.variants[0]?.id);
  const [added, setAdded] = useState(false);
  const [pending, setPending] = useState(false);
  const [addError, setAddError] = useState("");
  const [openAccordion, setOpenAccordion] =
    useState<PurchaseAccordionId | null>(null);
  const [hasPassedVideoStart, setHasPassedVideoStart] = useState(false);
  const [footerEnteringViewport, setFooterEnteringViewport] = useState(false);
  const videoStartRef = useRef<HTMLSpanElement>(null);

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
  const resolvedFullInci = resolveFullInci(product);
  const fullIngredientsText =
    resolvedFullInci?.text ||
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
  const howToUseItems = howToUse.map((step, index) => ({
    kicker: `Step ${String(index + 1).padStart(2, "0")}`,
    title: index === 0 ? "Start here" : `Then ${String(index + 1).padStart(2, "0")}`,
    body: step,
  }));
  const ingredientItems = content.ingredientCards.map((ingredient) => ({
    kicker: ingredient.label,
    title: ingredient.name,
    body: ingredient.copy,
  }));
  const corePresentation = getCorePdpPresentation(product.slug);
  const routineVideo =
    product.media.find(
      (media) =>
        media.role === "routine_video" &&
        media.kind === "video" &&
        Boolean(media.url),
    ) ?? null;
  const routinePoster =
    product.media.find(
      (media) =>
        media.role === "routine_video_poster" &&
        media.kind === "image" &&
        Boolean(media.url),
    ) ?? null;
  const profileMedia =
    product.media.find(
      (media) =>
        media.role === "profile_editorial" &&
        media.kind === "image" &&
        Boolean(media.url),
    ) ?? null;
  const ingredientsTextureMedia =
    product.media.find(
      (media) =>
        media.role === "ingredients_texture" &&
        media.kind === "image" &&
        Boolean(media.url),
    ) ?? null;
  const coreProfileReady = Boolean(corePresentation && profileMedia);
  const stickyVisible = hasPassedVideoStart && !footerEnteringViewport;

  useLayoutEffect(() => {
    const videoStart = videoStartRef.current;
    const footer = document.getElementById("site-footer");

    setHasPassedVideoStart(false);
    setFooterEnteringViewport(false);
    if (!videoStart || !footer) return;

    const updateInitialBoundaries = () => {
      const videoStartRect = videoStart.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      setHasPassedVideoStart(videoStartRect.top <= 0);
      setFooterEnteringViewport(
        footerRect.top < window.innerHeight && footerRect.bottom > 0,
      );
    };

    updateInitialBoundaries();
    let frame = 0;
    const scheduleBoundaryUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updateInitialBoundaries();
      });
    };

    window.addEventListener("scroll", scheduleBoundaryUpdate, {
      passive: true,
    });
    window.addEventListener("resize", scheduleBoundaryUpdate);
    const resizeObserver =
      "ResizeObserver" in window
        ? new ResizeObserver(scheduleBoundaryUpdate)
        : null;
    resizeObserver?.observe(document.body);
    resizeObserver?.observe(footer);

    return () => {
      window.removeEventListener("scroll", scheduleBoundaryUpdate);
      window.removeEventListener("resize", scheduleBoundaryUpdate);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [product.slug]);

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
      imageUrl: cartImageUrl(media),
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
                  priority={i === 0}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="pdp__purchase">
          <p className="pdp__collection">{routineLabel}</p>
          <h1>{product.displayName}</h1>
          <p className="pdp__tagline">{product.cardTagline}</p>
          <p className="pdp__description storefront-reading">{leadDescription}</p>
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

          <div className="pdp__actions">
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
          {isAvailable && variant && (
            <AfterpayMessaging
              amount={variant.price}
              currency={product.currency}
              publishableKey={stripePublishableKey}
            />
          )}
          <p className="add-feedback" role="status" aria-live="polite">
            {added ? "Added to cart" : addError}
          </p>

          <div className="pdp-accordions" aria-label={`${product.displayName} purchase details`}>
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
                    href={
                      corePresentation && content.ingredientStory
                        ? `#pdp-ingredients-${product.slug}`
                        : "#full-ingredients"
                    }
                    tabIndex={openAccordion === "ingredients" ? undefined : -1}
                  >
                    {corePresentation && content.ingredientStory
                      ? "Explore ingredients"
                      : "View full ingredients"}
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <span
        ref={videoStartRef}
        className="pdp-video-start-boundary"
        data-pdp-video-start
        aria-hidden="true"
      />

      {corePresentation ? (
        routineVideo && routinePoster ? (
          <PdpRoutineVideo
            productName={product.displayName}
            overlay={corePresentation.routineOverlay}
            video={routineVideo}
            poster={routinePoster}
          />
        ) : null
      ) : (
        <ProductEndorsementRail items={productEndorsementMedia} />
      )}

      <div
        className="pdp-sticky-purchase"
        data-layout-shell="storefront-fixed"
        data-visible={stickyVisible}
        aria-hidden={!stickyVisible}
      >
        <div className="pdp-sticky-purchase__identity">
          <ProductImage
            media={product.cartMedia ?? product.cardMedia}
            swatch={product.swatch}
            className="pdp-sticky-purchase__media"
            imageClassName="pdp-sticky-purchase__image"
            sizes="64px"
          />
          <span className="pdp-sticky-purchase__identity-copy">
            <span>{routineLabel}</span>
            <strong title={product.displayName}>{product.displayName}</strong>
            <small>{product.productType}</small>
          </span>
        </div>
        <div
          className="pdp-sticky-purchase__variants"
          role="group"
          aria-label={`${product.displayName} sticky size options`}
        >
          {product.variants.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === variantId}
              disabled={!option.available}
              tabIndex={stickyVisible ? undefined : -1}
              onClick={() => setVariantId(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="pdp-sticky-purchase__action">
          <span>{variant ? formatPrice(variant.price) : "—"}</span>
          {isAvailable && variant ? (
            <button
              type="button"
              className="btn"
              onClick={() => void handleAdd()}
              disabled={pending}
              tabIndex={stickyVisible ? undefined : -1}
              aria-label={`Add ${product.displayName} to cart — ${formatPrice(variant.price)}`}
            >
              {pending
                ? "Adding"
                : added
                  ? "Added"
                  : `Add — ${formatPrice(variant.price)}`}
            </button>
          ) : (
            <WaitlistButton
              className="btn"
              label="Join the waitlist"
              tabIndex={stickyVisible ? undefined : -1}
            />
          )}
        </div>
      </div>

      <section
        className="pdp-sections"
        aria-label={`${product.displayName} details`}
        data-pdp-panel-sequence
      >
        {corePresentation && profileMedia && coreProfileReady ? (
          <>
            <PdpProfileSplit
              product={product}
              presentation={corePresentation}
              media={profileMedia}
            />
            <PdpOutcomeSplit
              productName={product.displayName}
              presentation={corePresentation}
            />
            <PdpApplicationCarousel
              productName={product.displayName}
              steps={corePresentation.applicationSteps}
            />
            {content.ingredientStory && (
              <PdpIngredientsSplit
                productSlug={product.slug}
                productName={product.displayName}
                story={content.ingredientStory}
                media={ingredientsTextureMedia}
                fullInci={resolvedFullInci}
                mediaPosition={corePresentation.ingredientsMediaPosition}
              />
            )}
          </>
        ) : corePresentation ? null : (
          <ProductSignalGrid product={product} routineLabel={routineLabel} />
        )}

        {!corePresentation && (
          <>
            <PdpEditorialPair
              headingId="pdp-use-heading"
              eyebrow="Application"
              heading="HOW TO USE"
              summary="Step through the application order without leaving the product context."
              className="pdp-editorial-pair--use"
            >
              <PdpPanelSequence label="How to use" items={howToUseItems} />
            </PdpEditorialPair>

            <PdpEditorialPair
              headingId="pdp-inside-heading"
              eyebrow="Formula"
              heading="WHAT&apos;S INSIDE"
              summary="Ingredient notes stay close to the full INCI disclosure below."
              className="pdp-editorial-pair--inside"
            >
              {content.ingredientCards.length > 0 ? (
                <PdpPanelSequence label="What's inside" items={ingredientItems} />
              ) : (
                <p>Ingredient notes are not available for this product yet.</p>
              )}
            </PdpEditorialPair>

            <PdpEditorialPair
              headingId="full-ingredients-heading"
              eyebrow="Disclosure"
              heading="INGREDIENTS"
              summary="The full ingredient list is kept separate from editorial ingredient notes."
              className="pdp-editorial-pair--ingredients"
            >
              <details id="full-ingredients" className="full-ingredients">
                <summary>Full ingredients</summary>
                <p>{fullIngredientsText}</p>
              </details>
            </PdpEditorialPair>
          </>
        )}

        {details.length > 0 && (
          <PdpEditorialPair
            headingId="product-details"
            eyebrow="Specs"
            heading="DETAILS"
            summary="Server-backed product facts and routine placement."
            className="pdp-editorial-pair--details"
          >
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
          </PdpEditorialPair>
        )}

        {product.routineGroup === "core" && coreRoutine.length === 3 && (
          <PdpCoreRoutineSection
            products={coreRoutine}
            currentSlug={product.slug}
          />
        )}
      </section>

      <ProductReviewsSection
        key={product.slug}
        productName={product.displayName}
        productSlug={product.slug}
        reviews={reviews}
      />
    </>
  );
}
