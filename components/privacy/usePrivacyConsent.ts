"use client";
import { useEffect, useSyncExternalStore } from "react";
import {
  CONSENT_KEY,
  privacyConsent,
  SERVER_CONSENT,
} from "@/lib/privacy/consent";

let subscriptions = 0;
let release: (() => void) | undefined;
function connect() {
  subscriptions++;
  if (subscriptions === 1) {
    privacyConsent.load();
    const refresh = () => privacyConsent.load();
    const storage = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY || event.key === null) refresh();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60_000);
    release = () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }
  return () => {
    subscriptions--;
    if (subscriptions === 0) {
      release?.();
      release = undefined;
    }
  };
}
export function usePrivacyConsent() {
  const consent = useSyncExternalStore(
    privacyConsent.subscribe,
    privacyConsent.getSnapshot,
    () => SERVER_CONSENT,
  );
  useEffect(connect, []);
  return consent;
}
