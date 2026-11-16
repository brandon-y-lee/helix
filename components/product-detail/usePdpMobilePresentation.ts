"use client";

import { useSyncExternalStore } from "react";
import { PDP_MOBILE_PILOT_QUERY, type PdpPresentation } from "./pdp-presentation";

function subscribe(callback: () => void) {
  const query = window.matchMedia?.(PDP_MOBILE_PILOT_QUERY);
  query?.addEventListener?.("change", callback);
  return () => query?.removeEventListener?.("change", callback);
}

function mobileSnapshot() {
  return window.matchMedia?.(PDP_MOBILE_PILOT_QUERY).matches ?? false;
}

// Begin with the lean mobile media presentation on the server. A desktop-only
// decorative video must not load briefly before a phone hydrates.
const serverSnapshot = () => true;

export function usePdpMobilePresentation(presentation: PdpPresentation) {
  const mobile = useSyncExternalStore(subscribe, mobileSnapshot, serverSnapshot);
  return presentation === "mobile-pilot" && mobile;
}
