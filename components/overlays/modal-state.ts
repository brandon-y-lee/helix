"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";

type ModalCallbacks = {
  onClose: () => void;
  returnFocus: () => void;
  initialFocus?: () => HTMLElement | null;
};

type ModalLayer = {
  id: symbol;
  order: number;
  open: boolean;
  element: HTMLElement;
  panel: HTMLElement;
  callbacks: RefObject<ModalCallbacks>;
};

const layers = new Map<symbol, ModalLayer>();
const subscribers = new Set<() => void>();
let sequence = 0;
let lastOpenedOrder = 0;
let releaseBodyLock: (() => void) | null = null;
let focusTimeout: number | null = null;
let pendingReturnFocus: (() => void) | null = null;
let headerCartFocus: (() => void) | null = null;
const backgroundInert = new Map<HTMLElement, boolean>();
let backgroundObserver: MutationObserver | null = null;

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
}

function topLayer() {
  let top: ModalLayer | undefined;
  for (const layer of layers.values()) {
    if (!top || layer.order > top.order) top = layer;
  }
  return top?.open ? top : undefined;
}

function lockBodyScroll() {
  const body = document.body;
  const overflow = body.style.overflow;
  const paddingRight = body.style.paddingRight;
  const previousWidth = body.style.getPropertyValue("--sheet-scrollbar-width");
  const hadAttribute = body.hasAttribute("data-sheet-scroll-lock");
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  if (scrollbarWidth > 0) {
    const padding = Number.parseFloat(window.getComputedStyle(body).paddingRight);
    body.style.paddingRight = `${(Number.isFinite(padding) ? padding : 0) + scrollbarWidth}px`;
    body.style.setProperty("--sheet-scrollbar-width", `${scrollbarWidth}px`);
  }
  body.setAttribute("data-sheet-scroll-lock", "");
  body.style.overflow = "hidden";

  return () => {
    body.style.overflow = overflow;
    body.style.paddingRight = paddingRight;
    if (previousWidth) body.style.setProperty("--sheet-scrollbar-width", previousWidth);
    else body.style.removeProperty("--sheet-scrollbar-width");
    if (!hadAttribute) body.removeAttribute("data-sheet-scroll-lock");
  };
}

function focusableIn(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => {
    if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      const style = window.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
      if (current === panel) break;
    }
    return true;
  });
}

function focusInside(layer: ModalLayer) {
  if (layer.panel.contains(document.activeElement)) return;
  const preferred = layer.callbacks.current.initialFocus?.();
  const first = preferred && layer.panel.contains(preferred)
    ? preferred
    : focusableIn(layer.panel)[0];
  first?.focus({ preventScroll: true });
}

function syncBackground() {
  const modalElements = Array.from(layers.values(), (layer) => layer.element);
  function visit(parent: HTMLElement) {
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement) || /^(SCRIPT|STYLE|LINK)$/.test(child.tagName)) continue;
      const containsModal = modalElements.some((modal) => child === modal || child.contains(modal));
      if (containsModal) {
        if (backgroundInert.has(child)) {
          child.toggleAttribute("inert", backgroundInert.get(child));
          backgroundInert.delete(child);
        }
        if (!modalElements.includes(child)) visit(child);
      } else {
        if (!backgroundInert.has(child)) backgroundInert.set(child, child.hasAttribute("inert"));
        child.setAttribute("inert", "");
      }
    }
  }
  visit(document.body);
}

function restoreBackground() {
  backgroundObserver?.disconnect();
  backgroundObserver = null;
  for (const [element, wasInert] of backgroundInert) {
    element.toggleAttribute("inert", wasInert);
  }
  backgroundInert.clear();
}

function handleFocusIn() {
  const layer = topLayer();
  if (layer) focusInside(layer);
}

function handleKeyDown(event: KeyboardEvent) {
  const layer = topLayer();
  if (!layer || event.defaultPrevented) return;
  if (event.key === "Escape") {
    event.preventDefault();
    layer.callbacks.current.onClose();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = focusableIn(layer.panel);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    // Keyboard traversal must reveal targets inside a short, scrollable panel.
    last.focus();
  } else if ((!event.shiftKey && active === last) || !layer.panel.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

function publish() {
  for (const subscriber of subscribers) subscriber();
}

function openLayer(layer: ModalLayer) {
  if (focusTimeout !== null) window.clearTimeout(focusTimeout);
  if (layers.size === 0) {
    releaseBodyLock = lockBodyScroll();
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    backgroundObserver = new MutationObserver(syncBackground);
    backgroundObserver.observe(document.body, { childList: true });
  }
  layer.order = ++sequence;
  lastOpenedOrder = layer.order;
  pendingReturnFocus = null;
  layers.set(layer.id, layer);
  syncBackground();
  publish();
  focusTimeout = window.setTimeout(() => {
    focusTimeout = null;
    if (topLayer() === layer) focusInside(layer);
  }, 0);
}

function releaseLayer(id: symbol, restoreFocus: boolean) {
  const layer = layers.get(id);
  if (!layer) return;
  layers.delete(id);
  if (restoreFocus && layer.order === lastOpenedOrder) {
    pendingReturnFocus = () => layer.callbacks.current.returnFocus();
  }
  if (layers.size === 0) {
    if (focusTimeout !== null) window.clearTimeout(focusTimeout);
    focusTimeout = null;
    releaseBodyLock?.();
    releaseBodyLock = null;
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("focusin", handleFocusIn);
    restoreBackground();
    const restore = pendingReturnFocus;
    pendingReturnFocus = null;
    publish();
    restore?.();
  } else {
    syncBackground();
    const resumed = topLayer();
    const restore = resumed ? pendingReturnFocus : null;
    if (resumed) {
      lastOpenedOrder = resumed.order;
      pendingReturnFocus = null;
    }
    publish();
    if (resumed) {
      if (focusTimeout !== null) window.clearTimeout(focusTimeout);
      focusTimeout = window.setTimeout(() => {
        focusTimeout = null;
        if (topLayer() !== resumed) return;
        restore?.();
        focusInside(resumed);
      }, 0);
    }
  }
}

/** Includes exiting layers, so callers stay out of the way until a modal is gone. */
export function useModalPresence(): boolean {
  return useSyncExternalStore(subscribe, () => layers.size > 0, () => false);
}

export function registerHeaderCartFocus(callback: () => void) {
  headerCartFocus = callback;
  return () => {
    if (headerCartFocus === callback) headerCartFocus = null;
  };
}

export function focusHeaderCart() {
  if (layers.size === 0) headerCartFocus?.();
}

export function useModalLayer({
  open,
  layerRef,
  panelRef,
  onClose,
  returnFocus,
  initialFocus,
  waitForExit = false,
}: ModalCallbacks & {
  open: boolean;
  layerRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  waitForExit?: boolean;
}) {
  const id = useRef(Symbol("modal")).current;
  const callbacks = useRef({ onClose, returnFocus, initialFocus });
  callbacks.current = { onClose, returnFocus, initialFocus };
  const openRef = useRef(open);
  openRef.current = open;
  const active = useSyncExternalStore(subscribe, () => topLayer()?.id === id, () => false);

  const completeClose = useCallback(() => {
    if (!openRef.current) releaseLayer(id, true);
  }, [id]);

  useLayoutEffect(() => {
    const current = layers.get(id);
    if (open && panelRef.current && layerRef.current) {
      if (!current?.open) {
        openLayer({ id, order: 0, open: true, element: layerRef.current, panel: panelRef.current, callbacks });
      }
    } else if (current) {
      current.open = false;
      publish();
      if (!waitForExit) {
        // A sibling modal can register later in this same commit (Menu → Search).
        queueMicrotask(completeClose);
      }
    }
  }, [completeClose, id, layerRef, open, panelRef, waitForExit]);

  useEffect(() => () => releaseLayer(id, false), [id]);

  return { active: open && active, completeClose };
}
