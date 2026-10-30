import { inject, pageview, type BeforeSendEvent } from "@vercel/analytics";
import {
  injectSpeedInsights,
  type BeforeSendMiddleware,
} from "@vercel/speed-insights";
import type { MeasurementConfig } from "./measurement-config";
import { measurementContext } from "./measurement-policy";
import { reloadAfterPrivacyChange } from "./reload";
import { privacyConsent } from "./consent";

type Pixel = ((...args: unknown[]) => void) & {
  queue?: unknown[][];
  callMethod?: (...args: unknown[]) => void;
  push?: Pixel;
  loaded?: boolean;
  version?: string;
  disablePushState?: boolean;
};
declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
    fbq?: Pixel;
    _fbq?: Pixel;
  }
}

export function createMeasurementRuntime(
  config: MeasurementConfig,
  consent = privacyConsent,
  reload = reloadAfterPrivacyChange,
) {
  let active = false;
  let priorAnalytics = false;
  let priorMarketing = false;
  let gaReady = false;
  let gaDefaultQueued = false;
  let metaReady = false;
  let webStarted = false;
  let speedStarted = false;
  let lastGa = "";
  let lastMeta = "";
  let lastWeb = "";
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let stopListening: (() => void) | undefined;
  let speed: ReturnType<typeof injectSpeedInsights> = null;
  const gaId =
    config.gaEnabled && /^G-[A-Z0-9]{4,20}$/.test(config.gaId)
      ? config.gaId
      : "";
  const metaId =
    config.metaEnabled && /^\d{6,30}$/.test(config.metaId) ? config.metaId : "";
  const localVerification =
    config.verification === true &&
    (() => {
      try {
        return ["127.0.0.1", "localhost"].includes(
          new URL(config.origin).hostname,
        );
      } catch {
        return false;
      }
    })();
  const mockBase = "/helix-verification/privacy/mock";
  const context = () =>
    config.verification && !localVerification
      ? null
      : measurementContext(
          window.location.href,
          document.referrer,
          document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
            ?.href ?? "",
          config.origin,
          localVerification,
        );
  const allowed = (category: "analytics" | "marketing") =>
    active &&
    consent.current().ready &&
    consent.current()[category] &&
    context() !== null;

  function ga(...args: unknown[]) {
    window.gtag?.(...args);
  }
  function meta(...args: unknown[]) {
    window.fbq?.(...args);
  }
  function script(id: string, src: string, loaded: () => void) {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "true") loaded();
      return;
    }
    const element = document.createElement("script");
    element.id = id;
    element.src = src;
    element.async = true;
    element.referrerPolicy = "no-referrer";
    element.onload = () => {
      element.dataset.loaded = "true";
      loaded();
    };
    // A failed request never grants consent or changes the user's choice.
    element.onerror = () => {
      element.remove();
    };
    document.head.append(element);
  }
  const webBeforeSend = (event: BeforeSendEvent): BeforeSendEvent | null => {
    const current = context();
    if (!allowed("analytics") || !current || event.type !== "pageview")
      return null;
    const safe = measurementContext(
      event.url,
      "",
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ??
        "",
      config.origin,
      config.verification,
    );
    if (!safe || safe.url !== current.url || lastWeb === safe.url) return null;
    lastWeb = safe.url;
    return { type: "pageview", url: safe.url };
  };
  const speedBeforeSend: BeforeSendMiddleware = (event) => {
    const current = context();
    if (!allowed("analytics") || !current || event.url !== current.url)
      return null;
    return { type: "vital", url: current.url, route: current.route };
  };
  function dispatch() {
    const current = context();
    if (!current) return;
    if (allowed("analytics")) {
      if (gaId && gaReady && lastGa !== current.url) {
        lastGa = current.url;
        ga("event", "page_view", {
          page_location: current.url,
          page_title: current.title,
          page_referrer: "",
          send_to: gaId,
        });
      }
      if (webStarted) pageview({ route: current.route, path: current.path });
    }
    if (
      metaId &&
      metaReady &&
      allowed("marketing") &&
      lastMeta !== current.url
    ) {
      lastMeta = current.url;
      meta("trackSingle", metaId, "PageView");
    }
  }
  function clearCookies(names: string[]) {
    const present = new Set(
      document.cookie.split(";").map((part) => part.trim().split("=")[0]),
    );
    for (const name of names)
      if (present.has(name)) {
        for (const domain of [
          "",
          `; Domain=${window.location.hostname}`,
          `; Domain=.${window.location.hostname}`,
        ]) {
          document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain}${window.location.protocol === "https:" ? "; Secure" : ""}`;
        }
      }
  }
  function sync() {
    if (!active) return;
    const current = context();
    if (!consent.current().analytics && gaId)
      clearCookies(["_ga", `_ga_${gaId.slice(2)}`]);
    if (!consent.current().marketing && metaId) clearCookies(["_fbp", "_fbc"]);
    const analytics = allowed("analytics");
    const marketing = allowed("marketing");
    const revoked =
      (priorAnalytics && !analytics) || (priorMarketing && !marketing);
    priorAnalytics = analytics;
    priorMarketing = marketing;
    if (!analytics) {
      lastGa = "";
      lastWeb = "";
      if (gaReady)
        ga("consent", "update", {
          analytics_storage: "denied",
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
        });
    }
    if (!allowed("marketing")) {
      lastMeta = "";
      if (metaReady) meta("consent", "revoke");
    }
    if (
      revoked &&
      (gaReady ||
        metaReady ||
        webStarted ||
        speedStarted ||
        document.getElementById("helix-ga4") ||
        document.getElementById("helix-meta"))
    ) {
      if (!consent.current().error) {
        active = false;
        reload();
      }
      return;
    }
    if (analytics && current) {
      if (gaId && !gaReady) {
        window.dataLayer ??= [];
        window.gtag ??= (...args) => {
          window.dataLayer!.push(args);
        };
        // Google's documented disable flag is read live, including active-tab expiry/private navigation.
        Object.defineProperty(window, `ga-disable-${gaId}`, {
          configurable: true,
          get: () => !allowed("analytics"),
        });
        if (!gaDefaultQueued) {
          gaDefaultQueued = true;
          ga("consent", "default", {
            analytics_storage: "denied",
            ad_storage: "denied",
            ad_user_data: "denied",
            ad_personalization: "denied",
          });
        }
        script(
          "helix-ga4",
          localVerification
            ? `${mockBase}/ga.js`
            : `https://www.googletagmanager.com/gtag/js?id=${gaId}`,
          () => {
            if (!allowed("analytics") || gaReady) return;
            gaReady = true;
            ga("consent", "update", {
              analytics_storage: "granted",
              ad_storage: "denied",
              ad_user_data: "denied",
              ad_personalization: "denied",
            });
            ga("js", new Date());
            ga("config", gaId, {
              send_page_view: false,
              allow_google_signals: false,
              allow_ad_personalization_signals: false,
              cookie_domain: "none",
              cookie_expires: 180 * 24 * 60 * 60,
              page_location: context()!.url,
              page_title: context()!.title,
              page_referrer: "",
            });
            dispatch();
          },
        );
      } else if (gaReady)
        ga("consent", "update", {
          analytics_storage: "granted",
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
        });
      if (config.webAnalytics && !webStarted) {
        webStarted = true;
        inject(
          {
            framework: "next",
            disableAutoTrack: true,
            mode: "production",
            debug: false,
            beforeSend: webBeforeSend,
            basePath: config.vercelBasePath,
            ...(localVerification
              ? {
                  scriptSrc: `${mockBase}/web.js`,
                  viewEndpoint: `${mockBase}/event`,
                  eventEndpoint: `${mockBase}/event`,
                  sessionEndpoint: `${mockBase}/event`,
                }
              : {}),
          },
          localVerification ? "" : config.vercelConfig,
        );
      }
      if (config.speedInsights && !speedStarted) {
        speedStarted = true;
        window.si?.("beforeSend", speedBeforeSend);
        speed = injectSpeedInsights(
          {
            framework: "next",
            route: current.route,
            debug: false,
            beforeSend: speedBeforeSend,
            basePath: config.vercelBasePath,
            ...(localVerification
              ? {
                  scriptSrc: `${mockBase}/speed.js`,
                  endpoint: `${mockBase}/event`,
                }
              : {}),
          },
          localVerification ? "" : config.vercelConfig,
        );
      }
      speed?.setRoute(current.route);
    }
    if (metaId && allowed("marketing")) {
      if (!window.fbq) {
        const queue: Pixel = (...args) => {
          if (queue.callMethod) queue.callMethod(...args);
          else queue.queue!.push(args);
        };
        queue.queue = [];
        queue.push = queue;
        queue.loaded = true;
        queue.version = "2.0";
        window.fbq = queue;
        window._fbq = queue;
      }
      window.fbq.disablePushState = true;
      if (!metaReady)
        script(
          "helix-meta",
          localVerification
            ? `${mockBase}/meta.js`
            : "https://connect.facebook.net/en_US/fbevents.js",
          () => {
            if (!allowed("marketing") || metaReady) return;
            metaReady = true;
            meta("consent", "grant");
            meta("set", "autoConfig", false, metaId);
            meta("init", metaId);
            dispatch();
          },
        );
      else meta("consent", "grant");
    }
    dispatch();
    if (expiryTimer) clearTimeout(expiryTimer);
    const expires = consent.expiresAt();
    if (expires && expires > Date.now())
      expiryTimer = setTimeout(
        sync,
        Math.min(expires - Date.now() + 1, 2_147_483_647),
      );
  }
  return {
    sync,
    webBeforeSend,
    speedBeforeSend,
    start() {
      active = true;
      stopListening = consent.subscribe(sync);
      window.addEventListener("popstate", sync);
      window.addEventListener("hashchange", sync);
      window.addEventListener("focus", sync);
      document.addEventListener("visibilitychange", sync);
      sync();
    },
    stop() {
      active = false;
      stopListening?.();
      if (expiryTimer) clearTimeout(expiryTimer);
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
      if (gaReady)
        ga("consent", "update", {
          analytics_storage: "denied",
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
        });
      if (metaReady) meta("consent", "revoke");
      if (
        !context() &&
        !consent.current().error &&
        (gaReady || metaReady || webStarted || speedStarted)
      )
        reload();
    },
  };
}
