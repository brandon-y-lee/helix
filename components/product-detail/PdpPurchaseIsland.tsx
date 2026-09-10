"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
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
import type { ProductFamily } from "@/lib/catalog/models";
import { statusLabel } from "@/lib/catalog/product-status";
import { focusHeaderCart, useModalPresence } from "@/components/overlays/modal-state";
import { PDP_MOBILE_PILOT_QUERY, type PdpPresentation } from "./pdp-presentation";
import { usePdpMobilePresentation } from "./usePdpMobilePresentation";
import "./pdp-purchase-mobile.css";

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
  productFamily: ProductFamily | null;
  routineLabel: string;
  stickyMedia: ProductMedia | null;
  stripePublishableKey: string | null;
  unavailableLabel: string;
  variants: PdpPurchaseVariant[];
  showPrice: boolean;
  showVariantOptions: boolean;
  status: ProductStatus;
  commerceDisabled?: boolean;
  presentation?: PdpPresentation;
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
  productFamily,
  routineLabel,
  stickyMedia,
  stripePublishableKey,
  unavailableLabel,
  variants,
  showPrice,
  showVariantOptions,
  status,
  commerceDisabled = false,
  presentation = "default",
}: PdpPurchaseIslandProps) {
  const mobilePilot = usePdpMobilePresentation(presentation);
  const modalPresent = useModalPresence();
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
  const [hasPassedMainAction, setHasPassedMainAction] = useState(false);
  const [footerEnteringViewport, setFooterEnteringViewport] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [actionOrigin, setActionOrigin] = useState<"main" | "sticky">("main");
  const waitlistReturnFocusRef = useRef<() => void>(() => undefined);
  const mainBuyButtonRef = useRef<HTMLButtonElement>(null);
  const stickyBuyButtonRef = useRef<HTMLButtonElement>(null);
  const stickyPanelRef = useRef<HTMLDivElement>(null);
  const stickyConfigurationRef = useRef<HTMLSelectElement>(null);
  const focusFrameRef = useRef<number | null>(null);
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
  const stickyVisible = (mobilePilot ? hasPassedMainAction : hasPassedVideoStart)
    && !footerEnteringViewport && !(mobilePilot && modalPresent);
  const stickyConfiguration = presentation === "mobile-pilot" && !waitlist && showVariantOptions
    && variants.length > 1 && variants.some((option) => option.purchasable);
  const stickyFeedback = mobilePilot && stickyVisible && actionOrigin === "sticky";
  const closeWaitlist = useCallback(() => setWaitlistOpen(false), []);
  const restoreWaitlistFocus = useCallback(
    () => waitlistReturnFocusRef.current(),
    [],
  );

  function openWaitlist(returnFocus: () => void) {
    waitlistReturnFocusRef.current = returnFocus;
    setWaitlistOpen(true);
  }

  const restoreActionFocus = useCallback((origin: "main" | "sticky") => {
    if (presentation !== "mobile-pilot") {
      (origin === "main" ? mainBuyButtonRef : stickyBuyButtonRef).current?.focus({ preventScroll: true });
      return;
    }
    if (focusFrameRef.current !== null) window.cancelAnimationFrame(focusFrameRef.current);
    // Modal presence is published before React reveals the action again. Wait
    // for that commit, then read current geometry instead of an opening snapshot.
    focusFrameRef.current = window.requestAnimationFrame(() => {
      focusFrameRef.current = null;
      const main = mainBuyButtonRef.current;
      const sticky = stickyBuyButtonRef.current;
      if (!main || !sticky) return;
      const mobile = window.matchMedia?.(PDP_MOBILE_PILOT_QUERY).matches;
      const footer = document.getElementById("site-footer")?.getBoundingClientRect();
      const boundary = mobile
        ? main.getBoundingClientRect().bottom
        : document.querySelector("[data-pdp-video-start]")?.getBoundingClientRect().top;
      const eligible = boundary !== undefined && boundary <= 0 && footer
        && !(footer.top < window.innerHeight && footer.bottom > 0);
      const headerBottom = document.querySelector('.site-header:not([data-nav-state="hidden"])')
        ?.getBoundingClientRect().bottom ?? 0;
      const visible = (button: HTMLButtonElement) => {
        if (button.disabled || button.closest('[inert], [aria-hidden="true"], [hidden]')) return false;
        const style = window.getComputedStyle(button);
        const box = button.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden"
          && box.width > 0 && box.height > 0 && box.top >= Math.max(0, headerBottom)
          && box.bottom <= window.innerHeight;
      };
      if (origin === "sticky" && eligible && visible(sticky)) sticky.focus({ preventScroll: true });
      else if (visible(main)) main.focus({ preventScroll: true });
      else if (eligible && visible(sticky)) sticky.focus({ preventScroll: true });
      else focusHeaderCart();
    });
  }, [presentation]);

  useEffect(() => {
    if (modalPresent || presentation !== "mobile-pilot") return;
    const active = document.activeElement;
    if ((!stickyVisible && active === stickyBuyButtonRef.current)
      || (!mobilePilot && active === stickyConfigurationRef.current)) {
      restoreActionFocus("sticky");
    }
  }, [mobilePilot, modalPresent, presentation, restoreActionFocus, stickyVisible]);

  useEffect(() => {
    const panel = stickyPanelRef.current;
    if (!mobilePilot || !panel) return;
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--pdp-sticky-height");
    const measure = () => root.style.setProperty("--pdp-sticky-height", `${panel.getBoundingClientRect().height}px`);
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(panel);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      if (previous) root.style.setProperty("--pdp-sticky-height", previous);
      else root.style.removeProperty("--pdp-sticky-height");
    };
  }, [mobilePilot]);

  useEffect(
    () => () => {
      if (addedTimeoutRef.current) {
        window.clearTimeout(addedTimeoutRef.current);
      }
      if (focusFrameRef.current !== null) window.cancelAnimationFrame(focusFrameRef.current);
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
    if (!footer) return;

    const updateBoundaries = () => {
      const videoStartRect = videoStart?.getBoundingClientRect();
      const mainActionRect = mainBuyButtonRef.current?.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      setHasPassedVideoStart(Boolean(videoStartRect && videoStartRect.top <= 0));
      setHasPassedMainAction(Boolean(mainActionRect && mainActionRect.bottom <= 0));
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
      <div className="pdp__purchase" data-pdp-presentation={presentation}>
        {children}
        {productFamily && (
          <fieldset className="pdp-family-selector">
            <legend>{productFamily.displayName} options</legend>
            <div className="pdp-family-selector__options">
              {productFamily.memberships.map((membership) => {
                const state = statusLabel(membership.status) ?? "Available";
                const content = (
                  <>
                    <strong>{membership.optionLabel}</strong>
                    <span>{membership.displayName}</span>
                    <small>{state}</small>
                  </>
                );
                const className = "pdp-family-selector__option";
                const common = {
                  className,
                  "data-option-label": membership.optionLabel,
                  "data-product-status": membership.status,
                  "data-testid": "product-family-option",
                };
                return membership.isCurrent ? (
                  <span
                    key={membership.productId}
                    {...common}
                    aria-current="page"
                  >
                    {content}
                  </span>
                ) : (
                  <Link
                    key={membership.productId}
                    {...common}
                    href={`/products/${membership.slug}`}
                    aria-label={`${membership.optionLabel}: ${membership.displayName}, ${state}`}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          </fieldset>
        )}
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
                  disabled={!option.available || (presentation === "mobile-pilot" && pending)}
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
              setActionOrigin("main");
              const returnFocus = () => restoreActionFocus("main");
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
        <p className="add-feedback" role="status" aria-live={stickyFeedback ? "off" : "polite"}>
          {added ? "Added to cart" : addError}
        </p>
        {accordions}
      </div>

      <div
        ref={stickyPanelRef}
        className="pdp-sticky-purchase"
        data-pdp-presentation={presentation}
        data-layout-shell="storefront-fixed"
        data-visible={stickyVisible}
        aria-hidden={!stickyVisible}
        inert={!stickyVisible}
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
          {stickyConfiguration && (
            <select
              ref={stickyConfigurationRef}
              className="pdp-sticky-purchase__configuration"
              aria-label={`${productName} configuration`}
              value={variant?.id}
              disabled={pending}
              hidden={!mobilePilot}
              tabIndex={stickyVisible && mobilePilot ? undefined : -1}
              onChange={(event) => setVariantId(event.target.value)}
            >
              {variants.map((option) => (
                <option key={option.id} value={option.id} disabled={!option.available}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
          <button
            ref={stickyBuyButtonRef}
            type="button"
            className="btn"
            data-sticky-pdp-buy-button
            onClick={() => {
              setActionOrigin("sticky");
              const returnFocus = () => restoreActionFocus("sticky");
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
            aria-label={mobilePilot ? `${productName}: ${cta.label}` : cta.label}
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
        {stickyFeedback && (addError || added) && (
          <p className="pdp-sticky-purchase__feedback" role="status" aria-live="polite">
            {added ? "Added to cart" : addError}
          </p>
        )}
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
