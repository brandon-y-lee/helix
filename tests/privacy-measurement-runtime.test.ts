import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createConsentStore, CONSENT_LIFETIME_MS } from "@/lib/privacy/consent";
import { createMeasurementRuntime } from "@/lib/privacy/measurement-runtime";
import type { MeasurementConfig } from "@/lib/privacy/measurement-config";

let stop = () => {};
beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/");
  document.head
    .querySelectorAll('script,link[rel="canonical"]')
    .forEach((el) => el.remove());
  window.localStorage.clear();
  delete window.gtag;
  delete window.dataLayer;
  delete window.fbq;
  delete window._fbq;
  delete window.va;
  delete window.vaq;
  delete window.si;
  delete window.siq;
});
afterEach(() => {
  stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function setup() {
  let gpc = false;
  const consent = createConsentStore({
    storage: () => window.localStorage,
    now: () => Date.now(),
    gpc: () => gpc,
  });
  const config: MeasurementConfig = {
    verification: true,
    origin: window.location.origin,
    gaId: "G-HELIXTEST",
    metaId: "000000000000001",
    gaEnabled: true,
    metaEnabled: true,
    webAnalytics: true,
    speedInsights: true,
  };
  const reload = vi.fn();
  const runtime = createMeasurementRuntime(config, consent, reload);
  stop = runtime.stop;
  consent.load();
  runtime.start();
  return {
    consent,
    config,
    runtime,
    reload,
    setGpc: (value: boolean) => {
      gpc = value;
    },
  };
}
function load(id: string) {
  document.getElementById(id)?.dispatchEvent(new Event("load"));
}

it("loads no optional script before consent and keeps categories independent", () => {
  const s = setup();
  expect(document.querySelectorAll("script")).toHaveLength(0);
  s.consent.save({ analytics: true, marketing: false });
  expect(document.getElementById("helix-ga4")).not.toBeNull();
  expect(
    document.querySelectorAll('script[data-sdkn^="@vercel/"]'),
  ).toHaveLength(2);
  expect(document.getElementById("helix-meta")).toBeNull();
  load("helix-ga4");
  expect(window.dataLayer?.filter((args) => args[0] === "event")).toHaveLength(
    1,
  );
  s.runtime.sync();
  expect(window.dataLayer?.filter((args) => args[0] === "event")).toHaveLength(
    1,
  );
  expect(
    s.runtime.webBeforeSend({ type: "event", url: window.location.href }),
  ).toBeNull();
  expect(
    s.runtime.webBeforeSend({ type: "pageview", url: window.location.href }),
  ).toEqual({ type: "pageview", url: window.location.href });
  expect(
    s.runtime.webBeforeSend({ type: "pageview", url: window.location.href }),
  ).toBeNull();
});

it("revokes loaded SDKs, clears only their known cookies, and persistent callbacks deny", () => {
  const s = setup();
  s.consent.save({ analytics: true, marketing: true });
  load("helix-ga4");
  load("helix-meta");
  expect(window.fbq?.disablePushState).toBe(true);
  document.cookie = "helix_guest_cart=keep; Path=/";
  document.cookie = "_ga=synthetic; Path=/";
  document.cookie = "_fbp=synthetic; Path=/";
  expect(window.fbq?.queue).toEqual(
    expect.arrayContaining([
      ["set", "autoConfig", false, s.config.metaId],
      ["init", s.config.metaId],
      ["trackSingle", s.config.metaId, "PageView"],
    ]),
  );
  s.consent.save({ analytics: false, marketing: false });
  expect(window[`ga-disable-${s.config.gaId}` as keyof Window]).toBe(true);
  expect(window.fbq?.queue).toContainEqual(["consent", "revoke"]);
  expect(
    s.runtime.webBeforeSend({ type: "pageview", url: window.location.href }),
  ).toBeNull();
  expect(
    s.runtime.speedBeforeSend({ type: "vital", url: window.location.href }),
  ).toBeNull();
  expect(document.cookie).toContain("helix_guest_cart=keep");
  expect(document.cookie).not.toMatch(/_ga=|_fbp=/);
  expect(s.reload).toHaveBeenCalledOnce();
});

it("blocks delayed-load races, GPC, active-tab expiry and private navigation", () => {
  const s = setup();
  s.consent.save({ analytics: false, marketing: true });
  s.setGpc(true);
  s.runtime.sync();
  load("helix-meta");
  expect(window.fbq?.queue).not.toContainEqual(["init", s.config.metaId]);
  s.runtime.stop();
  s.runtime.start();
  s.setGpc(false);
  s.consent.save({ analytics: true, marketing: false });
  load("helix-ga4");
  vi.advanceTimersByTime(CONSENT_LIFETIME_MS);
  expect(window[`ga-disable-${s.config.gaId}` as keyof Window]).toBe(true);
  expect(
    s.runtime.speedBeforeSend({ type: "vital", url: window.location.href }),
  ).toBeNull();
  s.runtime.stop();
  s.runtime.start();
  s.consent.save({ analytics: true, marketing: false });
  window.history.pushState(null, "", "/account/reset-password?token=private");
  expect(window[`ga-disable-${s.config.gaId}` as keyof Window]).toBe(true);
  expect(
    s.runtime.webBeforeSend({ type: "pageview", url: window.location.href }),
  ).toBeNull();
  s.runtime.sync();
  expect(s.reload).toHaveBeenCalled();
});

it("does not reload into an old grant when a denial cannot be persisted", () => {
  const s = setup();
  s.consent.save({ analytics: true, marketing: true });
  load("helix-ga4");
  load("helix-meta");
  expect(window.fbq?.disablePushState).toBe(true);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(s.consent.save({ analytics: false, marketing: false })).toBe(false);
  expect(
    s.runtime.webBeforeSend({ type: "pageview", url: window.location.href }),
  ).toBeNull();
  expect(window[`ga-disable-${s.config.gaId}` as keyof Window]).toBe(true);
  window.history.replaceState({}, "", "/account?token=private");
  s.runtime.stop();
  expect(s.reload).not.toHaveBeenCalled();
});
