"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AfterpayMessaging } from "@/components/product-detail/AfterpayMessaging";
import { ProductImage } from "@/components/product/ProductImage";
import { useProductPurchase } from "@/components/cart/useProductPurchase";
import type { CartAddInput } from "@/lib/cart/types";
import {
  formatPrice,
  type ProductMedia,
  type ProductStatus,
} from "@/lib/products";
import { PREVIEW_COMMERCE_DISABLED_LABEL } from "@/lib/catalog-editor/preview-commerce";
import { ProductWaitlistSheet } from "@/components/product-detail/ProductWaitlistSheet";

export type PdpPurchaseVariant = {
  id: string;
  label: string;
  price: number;
  available: boolean;
  purchaseLabel: string;
  purchasable: boolean;
};

type PdpPurchaseCartBase = Pick<
  CartAddInput,
  "slug" | "name" | "swatch" | "imageUrl" | "imageAlt" | "placeholderMedia"
>;

export type PdpPurchaseIslandProps = {
  accordions: ReactNode;
  cartItem: PdpPurchaseCartBase;
  children: ReactNode;
  currency: "USD";
  productKey: string;
  productId: string;
  productName: string;
  productType: string | null;
  routineLabel: string;
  stickyMedia: ProductMedia | null;
  stripePublishableKey: string | null;
  unavailableLabel: string;
  variants: PdpPurchaseVariant[];
  showPrice: boolean;
  showVariantOptions: boolean;
  status: ProductStatus;
  commerceDisabled?: boolean;
};

export function PdpPurchaseIsland({
  accordions,
  cartItem,
  children,
  currency,
  productKey,
  productId,
  productName,
  productType,
  routineLabel,
  stickyMedia,
  stripePublishableKey,
  unavailableLabel,
  variants,
  showPrice,
  showVariantOptions,
  status,
  commerceDisabled = false,
}: PdpPurchaseIslandProps) {
  const {
    error: addError,
    pending,
    purchase,
  } = useProductPurchase();
  const variantSignature = useMemo(
    () => variants.map((variant) => variant.id).join("|"),
    [variants],
  );
  const [variantId, setVariantId] = useState(variants[0]?.id);
  const [added, setAdded] = useState(false);
  const [hasPassedVideoStart, setHasPassedVideoStart] = useState(false);
  const [footerEnteringViewport, setFooterEnteringViewport] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const waitlistReturnFocusRef = useRef<() => void>(() => undefined);
  const mainBuyButtonRef = useRef<HTMLButtonElement>(null);
  const stickyBuyButtonRef = useRef<HTMLButtonElement>(null);
  const addedTimeoutRef = useRef<number | null>(null);
  const variant =
    variants.find((option) => option.id === variantId) ?? variants[0];
  const waitlist = status === "waitlist";
  const productCta = waitlist
    ? { label: "Join the waitlist", purchasable: false }
    : variant
    ? {
        label: variant.purchaseLabel,
        purchasable: variant.purchasable,
      }
    : {
        label: unavailableLabel,
        purchasable: false,
      };
  const cta = commerceDisabled
    ? {
        label: PREVIEW_COMMERCE_DISABLED_LABEL,
        purchasable: false,
      }
    : productCta;
  const stickyPrice =
    variant && cta.purchasable ? formatPrice(variant.price) : null;
  const stickyLabelPrefix =
    stickyPrice && cta.label.endsWith(stickyPrice)
      ? cta.label.slice(0, -stickyPrice.length)
      : null;
  const stickyVisible = hasPassedVideoStart && !footerEnteringViewport;
  const closeWaitlist = useCallback(() => setWaitlistOpen(false), []);
  const restoreWaitlistFocus = useCallback(
    () => waitlistReturnFocusRef.current(),
    [],
  );

  function openWaitlist(returnFocus: () => void) {
    waitlistReturnFocusRef.current = returnFocus;
    setWaitlistOpen(true);
  }

  useEffect(
    () => () => {
      if (addedTimeoutRef.current) {
        window.clearTimeout(addedTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    setVariantId(variants[0]?.id);
    setAdded(false);
  }, [productKey, variantSignature, variants]);

  useEffect(() => {
    const videoStart = document.querySelector<HTMLElement>(
      "[data-pdp-video-start]",
    );
    const footer = document.getElementById("site-footer");

    setHasPassedVideoStart(false);
    setFooterEnteringViewport(false);
    if (!videoStart || !footer) return;

    const updateBoundaries = () => {
      const videoStartRect = videoStart.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      setHasPassedVideoStart(videoStartRect.top <= 0);
      setFooterEnteringViewport(
        footerRect.top < window.innerHeight && footerRect.bottom > 0,
      );
    };

    updateBoundaries();
    let frame = 0;
    const scheduleBoundaryUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updateBoundaries();
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
  }, [productKey]);

  async function handleAdd(returnFocus: () => void) {
    if (commerceDisabled || !variant || !cta.purchasable || pending) return;
    setAdded(false);
    const ok = await purchase({
      item: {
        ...cartItem,
        variantId: variant.id,
        variantLabel: variant.label,
        price: variant.price,
      },
      returnFocus,
    });
    if (!ok) return;

    setAdded(true);
    if (addedTimeoutRef.current) {
      window.clearTimeout(addedTimeoutRef.current);
    }
    addedTimeoutRef.current = window.setTimeout(() => {
      setAdded(false);
      addedTimeoutRef.current = null;
    }, 2200);
  }

  return (
    <>
      <div className="pdp__purchase">
        {children}
        {!waitlist && showPrice && variant && (
          <p className="pdp__price">{formatPrice(variant.price)}</p>
        )}

        {!waitlist && showVariantOptions && (
          <>
            <span className="field-label" id="size-label">
              Size
            </span>
            <div
              className="variant-options"
              role="group"
              aria-labelledby="size-label"
            >
              {variants.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="variant-option"
                  aria-pressed={option.id === variant?.id}
                  disabled={!option.available}
                  onClick={() => setVariantId(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="pdp__actions">
          <button
            ref={mainBuyButtonRef}
            type="button"
            className="btn"
            data-pdp-buy-button
            onClick={() => {
              const returnFocus = () => mainBuyButtonRef.current?.focus();
              if (waitlist && !commerceDisabled) {
                openWaitlist(returnFocus);
                return;
              }
              void handleAdd(returnFocus);
            }}
            disabled={
              commerceDisabled || (!waitlist && (!cta.purchasable || pending))
            }
          >
            {pending && cta.purchasable ? "Adding" : cta.label}
          </button>
        </div>
        {!commerceDisabled && cta.purchasable && variant && (
          <AfterpayMessaging
            amount={variant.price}
            currency={currency}
            publishableKey={stripePublishableKey}
          />
        )}
        <p className="add-feedback" role="status" aria-live="polite">
          {added ? "Added to cart" : addError}
        </p>
        {accordions}
      </div>

      <div
        className="pdp-sticky-purchase"
        data-layout-shell="storefront-fixed"
        data-visible={stickyVisible}
        aria-hidden={!stickyVisible}
      >
        <div className="pdp-sticky-purchase__identity">
          <ProductImage
            media={stickyMedia}
            swatch={cartItem.swatch}
            className="pdp-sticky-purchase__media"
            imageClassName="pdp-sticky-purchase__image"
            sizes="64px"
          />
          <span className="pdp-sticky-purchase__identity-copy">
            <span>{routineLabel}</span>
            <strong title={productName}>{productName}</strong>
            <small>{productType}</small>
          </span>
        </div>
        <div className="pdp-sticky-purchase__action">
          <button
            ref={stickyBuyButtonRef}
            type="button"
            className="btn"
            data-sticky-pdp-buy-button
            onClick={() => {
              const returnFocus = () => stickyBuyButtonRef.current?.focus();
              if (waitlist && !commerceDisabled) {
                openWaitlist(returnFocus);
                return;
              }
              void handleAdd(returnFocus);
            }}
            disabled={
              commerceDisabled || (!waitlist && (!cta.purchasable || pending))
            }
            tabIndex={stickyVisible ? undefined : -1}
            aria-label={cta.label}
          >
            {pending && cta.purchasable ? (
              "Adding"
            ) : stickyLabelPrefix && stickyPrice ? (
              <>
                {stickyLabelPrefix}
                <strong className="pdp-sticky-purchase__cta-price">
                  {stickyPrice}
                </strong>
              </>
            ) : (
              cta.label
            )}
          </button>
        </div>
      </div>
      {waitlist && !commerceDisabled && (
        <ProductWaitlistSheet
          open={waitlistOpen}
          productId={productId}
          productName={productName}
          onClose={closeWaitlist}
          returnFocus={restoreWaitlistFocus}
        />
      )}
    </>
  );
}
