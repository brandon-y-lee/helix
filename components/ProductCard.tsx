"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useCart } from "@/components/CartProvider";
import { ProductImage } from "@/components/ProductImage";
import {
  formatPrice,
  type Product,
  type ProductMedia,
  type Variant,
} from "@/lib/products";
import type { CartPlaceholderMedia } from "@/lib/cart/types";

function minPrice(product: Product): number {
  return product.variants.length
    ? Math.min(...product.variants.map((variant) => variant.price))
    : 0;
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

function isBuyableVariant(variant: Variant | undefined): variant is Variant {
  return Boolean(
    variant?.available &&
      variant.inventoryStatus !== "out_of_stock" &&
      variant.inventoryStatus !== "unavailable",
  );
}

function variantSizeLabel(variant: Variant | null | undefined, product: Product) {
  if (variant?.volume) return variant.volume;
  if (variant?.packCount) return `${variant.packCount} pack`;
  if (variant?.label) return variant.label;
  return product.volume ?? null;
}

function detailRows(product: Product, variant: Variant | null | undefined) {
  const routine = [product.routineNumber, product.routineStep]
    .filter(Boolean)
    .join(" · ");

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
  product: Product;
  quickBuyOpen?: boolean;
  previewKey?: string;
  onPreviewChange?: (key: string | null) => void;
  onQuickBuyOpen?: () => void;
  onQuickBuyClose?: () => void;
};

export function ProductCard({
  product,
  quickBuyOpen,
  previewKey,
  onPreviewChange,
  onQuickBuyOpen,
  onQuickBuyClose,
}: ProductCardProps) {
  const { add, cartDrawerOpen, openCartDrawer } = useCart();
  const panelBaseId = useId();
  const panelId = `${panelBaseId}-quick-buy`;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const finalButtonRef = useRef<HTMLButtonElement>(null);
  const addedTimeoutRef = useRef<number | null>(null);
  const pointerPreviewTimeoutRef = useRef<number | null>(null);
  const closePointerRef = useRef<{
    clientX: number;
    clientY: number;
    pointerType: string;
  } | null>(null);
  const controlled = quickBuyOpen !== undefined;
  const [localQuickBuyOpen, setLocalQuickBuyOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [pending, setPending] = useState(false);
  const [addError, setAddError] = useState("");
  const [pointerInside, setPointerInside] = useState(false);
  const [keyboardFocusVisibleWithin, setKeyboardFocusVisibleWithin] =
    useState(false);
  const keyboardFocusVisibleWithinRef = useRef(false);
  const lastInputWasKeyboardRef = useRef(false);
  const [selectedVariantId, setSelectedVariantId] = useState(
    product.variants.find(isBuyableVariant)?.id ?? product.variants[0]?.id ?? "",
  );

  const href = `/products/${product.slug}`;
  const availableVariants = useMemo(
    () =>
      product.variants.filter(
        (variant) =>
          variant.available &&
          variant.inventoryStatus !== "out_of_stock" &&
          variant.inventoryStatus !== "unavailable",
      ),
    [product.variants],
  );
  const selectedVariant =
    product.variants.find((variant) => variant.id === selectedVariantId) ??
    availableVariants[0] ??
    product.variants[0] ??
    null;
  const isQuickBuyOpen = controlled ? quickBuyOpen : localQuickBuyOpen;
  const canBuy =
    product.status === "available" && isBuyableVariant(selectedVariant);
  const startingPrice = minPrice(product);
  const hasRange = product.variants.length > 1;
  const priceLabel = `${hasRange ? "From " : ""}${formatPrice(startingPrice)}`;
  const displayName = product.displayName;
  const visualState = isQuickBuyOpen
    ? "quick-buy"
    : pointerInside || keyboardFocusVisibleWithin
      ? "preview"
      : "default";
  const rows = useMemo(
    () => detailRows(product, selectedVariant),
    [product, selectedVariant],
  );

  useEffect(() => {
    if (!isQuickBuyOpen) return;
    const current = product.variants.find(
      (variant) => variant.id === selectedVariantId,
    );
    if (isBuyableVariant(current)) return;
    setSelectedVariantId(
      availableVariants[0]?.id ?? product.variants[0]?.id ?? "",
    );
  }, [availableVariants, isQuickBuyOpen, product.variants, selectedVariantId]);

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
    setAddError("");
    setAdded(false);
    if (controlled) {
      onQuickBuyOpen?.();
    } else {
      setLocalQuickBuyOpen(true);
    }
  }

  function closeQuickBuy({
    focusTrigger = true,
    restorePointerPreview = false,
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
      triggerRef.current?.focus();
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
    if (event.key !== "Escape" || !isQuickBuyOpen || cartDrawerOpen) return;
    event.preventDefault();
    event.stopPropagation();
    closeQuickBuy();
  }

  function handleClosePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    closePointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType || "mouse",
    };
  }

  function handleCloseTouchStart() {
    closePointerRef.current = {
      clientX: 0,
      clientY: 0,
      pointerType: "touch",
    };
  }

  function handleCloseClick() {
    closeQuickBuy({
      restorePointerPreview: !lastInputWasKeyboardRef.current,
    });
  }

  async function handleFinalBuy() {
    if (!canBuy || !selectedVariant || pending) return;
    setPending(true);
    setAddError("");
    const media = product.cartMedia ?? product.cardMedia;
    const ok = await add({
      slug: product.slug,
      name: displayName,
      variantId: selectedVariant.id,
      variantLabel: selectedVariant.label,
      price: selectedVariant.price,
      swatch: product.swatch,
      imageUrl: null,
      imageAlt: media?.alt ?? null,
      placeholderMedia: cartPlaceholderMedia(media),
    });
    setPending(false);
    if (ok) {
      setAdded(true);
      openCartDrawer(() => finalButtonRef.current?.focus());
      if (addedTimeoutRef.current) {
        window.clearTimeout(addedTimeoutRef.current);
      }
      addedTimeoutRef.current = window.setTimeout(() => {
        setAdded(false);
        addedTimeoutRef.current = null;
      }, 2200);
    } else {
      setAddError("Cart is temporarily unavailable.");
    }
  }

  return (
    <li
      className="product-card"
      data-quick-buy-open={isQuickBuyOpen}
      data-visual-state={visualState}
    >
      <div
        ref={surfaceRef}
        className="product-card__surface"
        data-visual-state={visualState}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDownCapture={handlePointerDownCapture}
        onFocusCapture={handleFocusCapture}
        onBlurCapture={handleBlurCapture}
        onKeyDown={handlePanelKeyDown}
      >
        <ProductImage
          media={product.cardMedia}
          swatch={product.swatch}
          className="product-card__image"
          imageClassName="product-card__img"
          sizes="(max-width: 720px) 92vw, (max-width: 1180px) 33vw, 420px"
        />
        <ProductImage
          media={product.cardHoverMedia}
          swatch={product.swatch}
          className="product-card__image product-card__image--hover"
          imageClassName="product-card__img"
          sizes="(max-width: 720px) 92vw, (max-width: 1180px) 33vw, 420px"
        />

        <Link
          href={href}
          className="product-card__link"
          aria-label={displayName}
        >
          <span className="product-card__name">{displayName}</span>
          <span className="product-card__meta">
            <span className="product-card__tagline">{product.cardTagline}</span>
            <span className="product-card__price">{priceLabel}</span>
          </span>
        </Link>

        <div className="product-card__cta" aria-hidden={false}>
          <button
            ref={triggerRef}
            type="button"
            className="product-card__button product-card__quick-trigger"
            onClick={openQuickBuy}
            aria-label={`Open quick buy for ${displayName}`}
            aria-expanded={isQuickBuyOpen}
            aria-controls={panelId}
            tabIndex={isQuickBuyOpen ? -1 : undefined}
          >
            {product.status === "available"
              ? `${hasRange ? "CHOOSE" : "BUY"} ${displayName}`
              : "VIEW DETAILS"}
          </button>
        </div>

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

          {product.variants.length > 1 && (
            <fieldset className="product-card__quick-variants">
              <legend>Size</legend>
              <div className="product-card__quick-options">
                {product.variants.map((variant) => {
                  const buyable = isBuyableVariant(variant);
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
              ref={finalButtonRef}
              type="button"
              className="product-card__quick-final"
              onClick={() => void handleFinalBuy()}
              disabled={!canBuy || pending}
              tabIndex={isQuickBuyOpen ? undefined : -1}
              aria-label={
                selectedVariant
                  ? `Buy ${displayName} ${selectedVariant.label} for ${formatPrice(selectedVariant.price)}`
                  : `Buy ${displayName}`
              }
            >
              {pending
                ? "ADDING"
                : selectedVariant && canBuy
                  ? `BUY ${displayName} — ${formatPrice(selectedVariant.price)}`
                  : "UNAVAILABLE"}
            </button>
            <Link
              href={href}
              className="product-card__quick-link"
              tabIndex={isQuickBuyOpen ? undefined : -1}
            >
              Full details
            </Link>
          </div>
        </section>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {added ? `${displayName} added to cart` : addError}
      </span>
    </li>
  );
}
