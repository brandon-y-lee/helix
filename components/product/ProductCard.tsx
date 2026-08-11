"use client";

import Image from "next/image";
import Link from "next/link";
import {
  domAnimation,
  LazyMotion,
  MotionConfig,
  useReducedMotion,
  type Variants,
} from "motion/react";
import * as m from "motion/react-m";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ProductImage } from "@/components/product/ProductImage";
import { useProductPurchase } from "@/components/cart/useProductPurchase";
import { routineDisplayLabelForProduct } from "@/lib/catalog/product-routine";
import { cartMediaSnapshot } from "@/lib/cart/media";
import type {
  OfferAvailability,
  ProductCard as ProductCardModel,
} from "@/lib/catalog/models";
import {
  firstPurchasableVariant,
  formatPrice,
  isVariantPurchasable,
  productOfferPresentation,
  productPurchaseCta,
} from "@/lib/products";

type ProductCardCtaMotionState = "rest" | "preview" | "quick-buy";
type ProductCardVisualState = "default" | "preview" | "quick-buy";

const PRODUCT_CARD_DEFAULT_MEDIA_VARIANTS: Variants = {
  default: { opacity: 1, scale: 1 },
  preview: { opacity: 0, scale: 1.015 },
  "quick-buy": { opacity: 0, scale: 1.015 },
};

const PRODUCT_CARD_HOVER_MEDIA_VARIANTS: Variants = {
  default: { opacity: 0, scale: 1.025 },
  preview: { opacity: 1, scale: 1 },
  "quick-buy": { opacity: 1, scale: 1 },
};

const PRODUCT_CARD_META_VARIANTS: Variants = {
  default: {
    "--product-card-meta-opacity": 1,
    "--product-card-meta-translate-y": "0px",
  },
  preview: {
    "--product-card-meta-opacity": 0,
    "--product-card-meta-translate-y": "6px",
  },
  "quick-buy": {
    "--product-card-meta-opacity": 0,
    "--product-card-meta-translate-y": "6px",
  },
};

const PRODUCT_CARD_META_INITIAL_STYLE = {
  "--product-card-meta-opacity": 1,
  "--product-card-meta-translate-y": "0px",
} as CSSProperties;

const PRODUCT_CARD_CTA_VARIANTS: Variants = {
  rest: { "--product-card-cta-translate-y": "150%" },
  preview: { "--product-card-cta-translate-y": "0%" },
  "quick-buy": { "--product-card-cta-translate-y": "150%" },
};

const PRODUCT_CARD_CTA_EASE = [0.76, 0, 0.24, 1] as const;

function variantSizeLabel(
  variant: OfferAvailability | null | undefined,
  product: ProductCardModel,
) {
  if (variant?.volume) return variant.volume;
  if (variant?.packCount) return `${variant.packCount} pack`;
  if (variant?.label) return variant.label;
  return product.volume ?? null;
}

function detailRows(
  product: ProductCardModel,
  variant: OfferAvailability | null | undefined,
) {
  const routine = routineDisplayLabelForProduct(product);

  return [
    { label: "Routine", value: routine },
    { label: "Format", value: product.productType },
    { label: "Use", value: product.usageTime.join(" + ") },
    { label: "Size", value: variantSizeLabel(variant, product) },
  ].filter((item): item is { label: string; value: string } =>
    Boolean(item.value),
  );
}

type ProductCardProps = {
  product: ProductCardModel;
  className?: string;
  defaultImage?: ProductCardImageOverride;
  imageSizes?: string;
  quickBuyOpen?: boolean;
  previewKey?: string;
  style?: CSSProperties;
  onPreviewChange?: (key: string | null) => void;
  onQuickBuyOpen?: () => void;
  onQuickBuyClose?: () => void;
};

export type ProductCardImageOverride = {
  src: string;
  alt: string;
  width: number;
  height: number;
  objectPosition?: string;
  presentation?: "cutout" | "full-frame";
  priority?: boolean;
  sizes?: string;
};

export function ProductCard({
  product,
  className,
  defaultImage,
  imageSizes,
  quickBuyOpen,
  previewKey,
  style,
  onPreviewChange,
  onQuickBuyOpen,
  onQuickBuyClose,
}: ProductCardProps) {
  const shouldReduceMotion = useReducedMotion();
  const {
    clearError,
    error: addError,
    pending,
    purchase,
  } = useProductPurchase();
  const panelBaseId = useId();
  const panelId = `${panelBaseId}-quick-buy`;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const addedTimeoutRef = useRef<number | null>(null);
  const pointerPreviewTimeoutRef = useRef<number | null>(null);
  const closePointerRef = useRef<{
    clientX: number;
    clientY: number;
    pointerType: string;
    viewport: { scrollX: number; scrollY: number };
  } | null>(null);
  const viewportRestoreFrameRef = useRef<number | null>(null);
  const controlled = quickBuyOpen !== undefined;
  const [localQuickBuyOpen, setLocalQuickBuyOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);
  const [keyboardFocusVisibleWithin, setKeyboardFocusVisibleWithin] =
    useState(false);
  const keyboardFocusVisibleWithinRef = useRef(false);
  const lastInputWasKeyboardRef = useRef(false);
  const [selectedVariantId, setSelectedVariantId] = useState(
    firstPurchasableVariant(product)?.id ?? product.variants[0]?.id ?? "",
  );

  const href = `/products/${product.slug}`;
  const availableVariants = useMemo(
    () =>
      product.variants.filter((variant) =>
        isVariantPurchasable(product, variant),
      ),
    [product],
  );
  const selectedVariant =
    product.variants.find((variant) => variant.id === selectedVariantId) ??
    availableVariants[0] ??
    product.variants[0] ??
    null;
  const isWaitlist = product.status === "waitlist";
  const isQuickBuyOpen =
    !isWaitlist && (controlled ? quickBuyOpen : localQuickBuyOpen);
  const purchaseCta = productPurchaseCta(product, selectedVariant);
  const canBuy = purchaseCta.purchasable;
  const offerPresentation = productOfferPresentation(product.variants);
  const startingPrice = offerPresentation.showPrice
    ? Math.min(...offerPresentation.offers.map((variant) => variant.price))
    : null;
  const priceLabel = isWaitlist
    ? "Waitlist"
    : startingPrice === null
      ? null
      : `${offerPresentation.hasMultipleOffers ? "From " : ""}${formatPrice(startingPrice)}`;
  const displayName = product.displayName;
  const cardImageSizes =
    defaultImage?.sizes ??
    imageSizes ??
    "(max-width: 1020px) 48vw, 33vw";
  const defaultImageStyle = defaultImage
    ? ({
        "--product-card-image-object-position":
          defaultImage.objectPosition ?? "50% 50%",
      } as CSSProperties)
    : undefined;
  const visualState: ProductCardVisualState = isQuickBuyOpen
    ? "quick-buy"
    : pointerInside || keyboardFocusVisibleWithin
      ? "preview"
      : "default";
  const ctaMotionState: ProductCardCtaMotionState =
    visualState === "default" ? "rest" : visualState;
  const rows = useMemo(
    () => detailRows(product, selectedVariant),
    [product, selectedVariant],
  );

  useEffect(() => {
    if (!isQuickBuyOpen) return;
    const current = product.variants.find(
      (variant) => variant.id === selectedVariantId,
    );
    if (isVariantPurchasable(product, current)) return;
    setSelectedVariantId(
      availableVariants[0]?.id ?? product.variants[0]?.id ?? "",
    );
  }, [availableVariants, isQuickBuyOpen, product, selectedVariantId]);

  useEffect(() => {
    function rememberKeyboard() {
      lastInputWasKeyboardRef.current = true;
    }
    function rememberPointer() {
      lastInputWasKeyboardRef.current = false;
    }

    window.addEventListener("keydown", rememberKeyboard, true);
    window.addEventListener("pointerdown", rememberPointer, true);
    return () => {
      window.removeEventListener("keydown", rememberKeyboard, true);
      window.removeEventListener("pointerdown", rememberPointer, true);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (addedTimeoutRef.current) {
        window.clearTimeout(addedTimeoutRef.current);
      }
      if (pointerPreviewTimeoutRef.current) {
        window.clearTimeout(pointerPreviewTimeoutRef.current);
      }
      if (viewportRestoreFrameRef.current) {
        window.cancelAnimationFrame(viewportRestoreFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function syncPointerPosition(event: globalThis.PointerEvent) {
      if (!pointerInside || event.pointerType === "touch") return;

      const surface = surfaceRef.current;
      if (!surface) return;

      const rect = surface.getBoundingClientRect();
      const isInside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (isInside) return;
      if (pointerPreviewTimeoutRef.current) {
        window.clearTimeout(pointerPreviewTimeoutRef.current);
        pointerPreviewTimeoutRef.current = null;
      }
      setPointerInside(false);
    }

    window.addEventListener("pointermove", syncPointerPosition, true);
    return () => {
      window.removeEventListener("pointermove", syncPointerPosition, true);
    };
  }, [pointerInside]);

  function openQuickBuy() {
    clearError();
    setAdded(false);
    if (controlled) {
      onQuickBuyOpen?.();
    } else {
      setLocalQuickBuyOpen(true);
    }
  }

  function preserveViewportAfterUpdate(
    viewport = { scrollX: window.scrollX, scrollY: window.scrollY },
  ) {
    const { scrollX, scrollY } = viewport;
    const restoreViewport = () => {
      if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
        window.scrollTo(scrollX, scrollY);
      }
    };
    restoreViewport();
    if (viewportRestoreFrameRef.current) {
      window.cancelAnimationFrame(viewportRestoreFrameRef.current);
    }
    viewportRestoreFrameRef.current = window.requestAnimationFrame(() => {
      viewportRestoreFrameRef.current = null;
      restoreViewport();
    });
  }

  function focusTriggerWithoutScrolling() {
    const viewport = { scrollX: window.scrollX, scrollY: window.scrollY };
    triggerRef.current?.focus({ preventScroll: true });
    preserveViewportAfterUpdate(viewport);
  }

  function closeQuickBuy({
    focusTrigger = true,
    restorePointerPreview = false,
    viewport,
  }: {
    focusTrigger?: boolean;
    restorePointerPreview?: boolean;
    viewport?: { scrollX: number; scrollY: number };
  } = {}) {
    if (controlled) {
      onQuickBuyClose?.();
    } else {
      setLocalQuickBuyOpen(false);
    }
    if (restorePointerPreview) {
      const closePointer = closePointerRef.current;
      const shouldRestorePointerPreview = closePointer?.pointerType !== "touch";
      setPointerInside(shouldRestorePointerPreview);
      if (pointerPreviewTimeoutRef.current) {
        window.clearTimeout(pointerPreviewTimeoutRef.current);
      }
      if (shouldRestorePointerPreview) {
        pointerPreviewTimeoutRef.current = window.setTimeout(() => {
          setPointerInside(true);
          pointerPreviewTimeoutRef.current = null;
        }, 0);
      }
    }
    if (focusTrigger) {
      focusTriggerWithoutScrolling();
    } else {
      preserveViewportAfterUpdate(viewport);
    }
  }

  function updateKeyboardFocusVisibleWithin(nextValue: boolean) {
    if (keyboardFocusVisibleWithinRef.current === nextValue) return;
    keyboardFocusVisibleWithinRef.current = nextValue;
    setKeyboardFocusVisibleWithin(nextValue);
  }

  function handlePointerEnter(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    if (previewKey) onPreviewChange?.(previewKey);
    setPointerInside(true);
  }

  function handlePointerLeave(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    if (previewKey) onPreviewChange?.(null);
    setPointerInside(false);
  }

  function handlePointerDownCapture() {
    lastInputWasKeyboardRef.current = false;
    updateKeyboardFocusVisibleWithin(false);
  }

  function handleFocusCapture() {
    if (previewKey) onPreviewChange?.(previewKey);
    updateKeyboardFocusVisibleWithin(lastInputWasKeyboardRef.current);
  }

  function handleBlurCapture(event: FocusEvent<HTMLElement>) {
    const nextFocus = event.relatedTarget;
    if (
      !nextFocus ||
      !(nextFocus instanceof Node) ||
      !event.currentTarget.contains(nextFocus)
    ) {
      if (previewKey) onPreviewChange?.(null);
      updateKeyboardFocusVisibleWithin(false);
    }
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    lastInputWasKeyboardRef.current = true;
    if (event.key !== "Escape" || !isQuickBuyOpen) return;
    event.preventDefault();
    event.stopPropagation();
    closeQuickBuy();
  }

  function handleClosePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    closePointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType || "mouse",
      viewport: { scrollX: window.scrollX, scrollY: window.scrollY },
    };
  }

  function handleCloseTouchStart() {
    closePointerRef.current = {
      clientX: 0,
      clientY: 0,
      pointerType: "touch",
      viewport: { scrollX: window.scrollX, scrollY: window.scrollY },
    };
  }

  function handleCloseClick(event: ReactMouseEvent<HTMLButtonElement>) {
    const closePointer = closePointerRef.current;
    const closeWasTouch =
      closePointer?.pointerType === "touch" && !lastInputWasKeyboardRef.current;
    const viewport = closeWasTouch ? closePointer.viewport : undefined;
    if (viewport) {
      event.currentTarget.blur();
    }
    closeQuickBuy({
      focusTrigger: !closeWasTouch,
      restorePointerPreview: !lastInputWasKeyboardRef.current,
      viewport,
    });
    closePointerRef.current = null;
  }

  async function handleFinalBuy() {
    if (!canBuy || !selectedVariant || pending) return;
    const media = product.cartMedia ?? product.cardMedia;
    const ok = await purchase({
      item: {
        slug: product.slug,
        name: displayName,
        variantId: selectedVariant.id,
        variantLabel: selectedVariant.label,
        price: selectedVariant.price,
        swatch: product.swatch,
        ...cartMediaSnapshot(media),
      },
      beforeDrawerOpen: () => {
        closeQuickBuy({ focusTrigger: false });
      },
      returnFocus: focusTriggerWithoutScrolling,
    });
    if (ok) {
      setAdded(true);
      if (addedTimeoutRef.current) {
        window.clearTimeout(addedTimeoutRef.current);
      }
      addedTimeoutRef.current = window.setTimeout(() => {
        setAdded(false);
        addedTimeoutRef.current = null;
      }, 2200);
    }
  }

  return (
    <li
      className={["product-card", className].filter(Boolean).join(" ")}
      data-product-card
      data-product-card-slug={product.slug}
      data-quick-buy-open={isQuickBuyOpen}
      data-visual-state={visualState}
      style={style}
    >
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <div
            ref={surfaceRef}
            className="product-card__surface"
            data-product-card-media
            data-product-card-media-layout="full-bleed"
            data-visual-state={visualState}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            onPointerDownCapture={handlePointerDownCapture}
            onFocusCapture={handleFocusCapture}
            onBlurCapture={handleBlurCapture}
            onKeyDown={handlePanelKeyDown}
          >
            <m.div
              className="product-card__motion-layer product-card__motion-layer--default"
              data-motion-state={visualState}
              variants={PRODUCT_CARD_DEFAULT_MEDIA_VARIANTS}
              initial={false}
              animate={visualState}
              transition={{
                type: "tween",
                duration: shouldReduceMotion ? 0 : 0.7,
                ease: PRODUCT_CARD_CTA_EASE,
              }}
            >
              {defaultImage ? (
                <span
                  className="product-card__image product-card__image--asset"
                  data-media-kind="image"
                  data-product-card-default-image="true"
                  data-product-card-image-presentation={
                    defaultImage.presentation ?? "cutout"
                  }
                  style={defaultImageStyle}
                >
                  <Image
                    src={defaultImage.src}
                    alt={defaultImage.alt}
                    width={defaultImage.width}
                    height={defaultImage.height}
                    sizes={cardImageSizes}
                    priority={defaultImage.priority}
                    className="product-card__img product-card__img--asset"
                  />
                </span>
              ) : (
                <ProductImage
                  media={product.cardMedia}
                  swatch={product.swatch}
                  className="product-card__image"
                  imageClassName="product-card__img"
                  sizes={cardImageSizes}
                />
              )}
            </m.div>
            <m.div
              className="product-card__motion-layer product-card__motion-layer--hover"
              data-motion-state={visualState}
              variants={PRODUCT_CARD_HOVER_MEDIA_VARIANTS}
              initial={false}
              animate={visualState}
              transition={{
                type: "tween",
                duration: shouldReduceMotion ? 0 : 0.7,
                ease: PRODUCT_CARD_CTA_EASE,
              }}
            >
              <ProductImage
                media={product.cardHoverMedia}
                swatch={product.swatch}
                className="product-card__image product-card__image--hover"
                imageClassName="product-card__img"
                sizes={cardImageSizes}
              />
            </m.div>

            <Link
              href={href}
              className="product-card__link"
              aria-label={displayName}
              draggable={false}
            >
              <span className="product-card__step">
                {product.systemStepName}
              </span>
              <m.span
                className="product-card__meta"
                data-motion-state={visualState}
                style={PRODUCT_CARD_META_INITIAL_STYLE}
                variants={PRODUCT_CARD_META_VARIANTS}
                initial={false}
                animate={visualState}
                transition={{
                  type: "tween",
                  duration: shouldReduceMotion ? 0 : 0.2,
                  ease: "easeOut",
                }}
              >
                <span className="product-card__identity">
                  <span className="product-card__display-name">
                    {displayName}
                  </span>
                  <span className="product-card__type">
                    {product.productType}
                  </span>
                </span>
                {priceLabel ? (
                  <span className="product-card__price">{priceLabel}</span>
                ) : null}
              </m.span>
            </Link>

            {!isWaitlist && (
              <m.div
                className="product-card__cta"
                data-motion-state={ctaMotionState}
                variants={PRODUCT_CARD_CTA_VARIANTS}
                initial={false}
                animate={ctaMotionState}
                transition={{
                  type: "tween",
                  duration: shouldReduceMotion ? 0 : 0.7,
                  ease: PRODUCT_CARD_CTA_EASE,
                }}
              >
                <button
                  ref={triggerRef}
                  type="button"
                  className="product-card__button product-card__quick-trigger"
                  onClick={openQuickBuy}
                  aria-label={
                    canBuy
                      ? `Open quick buy for ${displayName}`
                      : purchaseCta.label
                  }
                  aria-expanded={isQuickBuyOpen}
                  aria-controls={panelId}
                  disabled={!canBuy}
                  tabIndex={
                    isQuickBuyOpen || visualState === "default" ? -1 : undefined
                  }
                >
                  {purchaseCta.label}
                </button>
              </m.div>
            )}

            {!isWaitlist && (
              <section
                id={panelId}
                className="product-card__quick-buy"
                data-open={isQuickBuyOpen}
                aria-hidden={!isQuickBuyOpen}
                aria-labelledby={`${panelId}-title`}
              >
              <button
                type="button"
                className="product-card__quick-close"
                onPointerDown={handleClosePointerDown}
                onTouchStart={handleCloseTouchStart}
                onClick={handleCloseClick}
                aria-label={`Close quick buy for ${displayName}`}
                tabIndex={isQuickBuyOpen ? undefined : -1}
              >
                <span aria-hidden="true" />
              </button>
              <div className="product-card__quick-head">
                <ProductImage
                  media={product.cartMedia ?? product.cardMedia}
                  swatch={product.swatch}
                  className="product-card__quick-thumb"
                  imageClassName="product-card__quick-thumb-img"
                  sizes="72px"
                />
                <div>
                  <h3 id={`${panelId}-title`}>{displayName}</h3>
                  {product.productType && <p>{product.productType}</p>}
                </div>
              </div>

              {rows.length > 0 && (
                <dl className="product-card__quick-details">
                  {rows.map((row) => (
                    <div key={row.label} className="product-card__quick-row">
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <Link
                href={href}
                className="product-card__quick-link"
                tabIndex={isQuickBuyOpen ? undefined : -1}
              >
                Full details
              </Link>

              {offerPresentation.hasMultipleOffers && (
                <fieldset className="product-card__quick-variants">
                  <legend>Size</legend>
                  <div className="product-card__quick-options">
                    {offerPresentation.offers.map((variant) => {
                      const buyable = isVariantPurchasable(product, variant);
                      return (
                        <label
                          key={variant.id}
                          className="product-card__quick-option"
                          data-disabled={!buyable}
                        >
                          <input
                            type="radio"
                            name={`${panelId}-variant`}
                            value={variant.id}
                            checked={selectedVariant?.id === variant.id}
                            disabled={!buyable}
                            onChange={() => setSelectedVariantId(variant.id)}
                            tabIndex={isQuickBuyOpen ? undefined : -1}
                          />
                          <span>{variant.label}</span>
                          <small>{formatPrice(variant.price)}</small>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              <div className="product-card__quick-footer">
                <button
                  type="button"
                  className="product-card__quick-final"
                  data-product-card-buy
                  onClick={() => void handleFinalBuy()}
                  disabled={!canBuy || pending}
                  tabIndex={isQuickBuyOpen ? undefined : -1}
                  aria-label={
                    pending && canBuy ? "ADDING" : purchaseCta.label
                  }
                >
                  {pending ? "ADDING" : purchaseCta.label}
                </button>
              </div>
              </section>
            )}
          </div>
        </MotionConfig>
      </LazyMotion>
      <span className="sr-only" role="status" aria-live="polite">
        {added ? `${displayName} added to cart` : addError}
      </span>
    </li>
  );
}
