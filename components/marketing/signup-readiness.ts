"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { runtimeSupabaseTarget } from "@/lib/supabase/project-safety";

export const welcomeSubscription = "/api/marketing/production/subscription";
export const welcomeSignupPaused = "Welcome email signup is paused. Please check back later.";
export const signupRequestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
  referrerPolicy: "no-referrer",
} as const;
export type SignupSite = "canonical" | "immutable" | "dev-preview" | "legacy" | "unavailable";
export type SignupScope = "welcome_only" | "lifecycle" | "lifecycle_reviews";
type SignupReadiness = SignupScope | "inspection" | null;

function browserSite(): SignupSite {
  const { origin, hostname, protocol } = window.location;
  if (origin === "https://www.helixskin.us") return "canonical";
  if (origin === "https://helix-git-codex-558-verified-e87038-brandons-projects-5060bad5.vercel.app") {
    try {
      return runtimeSupabaseTarget() === "development" ? "dev-preview" : "unavailable";
    } catch {
      return "unavailable";
    }
  }
  if (/^https:\/\/helix-[a-z0-9]+-brandons-projects-5060bad5\.vercel\.app$/.test(origin)) return "immutable";
  if (
    origin === "https://helixskin.vercel.app" ||
    (["localhost", "127.0.0.1", "[::1]"].includes(hostname) && ["http:", "https:"].includes(protocol))
  )
    return "legacy";
  return "unavailable";
}

// Host selection never changes within a document. The pre-hydration form stays closed.
const subscribe = () => () => {};
const serverSite = (): SignupSite => "unavailable";
export function useSignupSite() {
  return useSyncExternalStore(subscribe, browserSite, serverSite);
}

export async function readSignupScope(site: SignupSite, signal: AbortSignal): Promise<SignupReadiness> {
  if (site === "unavailable") return null;
  if (site === "dev-preview") return "inspection";
  const path = site === "legacy" ? "/api/marketing/readiness" : welcomeSubscription;
  const response = await fetch(path, { ...signupRequestOptions, signal });
  if (!response.ok) return null;
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") return null;
  if (site !== "legacy") {
    if (!("production" in data) || data.production !== true || !("enabled" in data)) return null;
    if (site === "immutable") return data.enabled === false ? "inspection" : null;
    return data.enabled === true ? "welcome_only" : null;
  }
  if (!("ready" in data) || data.ready !== true) return null;
  const scope = "scope" in data ? data.scope : "lifecycle";
  return scope === "lifecycle" || scope === "lifecycle_reviews" ? scope : null;
}

export function useSignupReadiness(site: SignupSite) {
  const [readiness, setReadiness] = useState<SignupReadiness | "checking">("checking");
  useEffect(() => {
    if (site === "unavailable") return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      setReadiness(null);
    }, 5000);
    void readSignupScope(site, controller.signal)
      .then((scope) => {
        if (!controller.signal.aborted) setReadiness(scope);
      })
      .catch(() => {
        if (!controller.signal.aborted) setReadiness(null);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [site]);
  return site === "unavailable" ? null : readiness;
}
