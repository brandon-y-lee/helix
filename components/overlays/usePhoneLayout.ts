"use client";

import { useSyncExternalStore } from "react";

const PHONE_QUERY = "(max-width: 720px)";

function subscribe(callback: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getSnapshot() {
  return typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
}

/** Share the phone presentation boundary without changing server-rendered content. */
export function usePhoneLayout() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
