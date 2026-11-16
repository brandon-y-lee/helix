import { describe, expect, it } from "vitest";
import {
  createConsentStore,
  CONSENT_KEY,
  CONSENT_LIFETIME_MS,
} from "@/lib/privacy/consent";

function setup(raw?: string) {
  let time = 1_800_000_000_000;
  let gpc = false;
  let blocked = false;
  const data = new Map(raw ? [[CONSENT_KEY, raw]] : []);
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (blocked) throw new Error("blocked");
      data.set(key, value);
    },
  };
  const store = createConsentStore({
    storage: () => storage,
    now: () => time,
    gpc: () => gpc,
  });
  return {
    store,
    data,
    setTime: (value: number) => {
      time = value;
    },
    setGpc: (value: boolean) => {
      gpc = value;
    },
    block: () => {
      blocked = true;
    },
    now: () => time,
  };
}

describe("browser privacy consent", () => {
  it("fails closed before hydration and for malformed, expired or future choices", () => {
    for (const raw of [
      undefined,
      "broken",
      '{"version":1,"analytics":true}',
      JSON.stringify({
        version: 1,
        analytics: true,
        marketing: true,
        updatedAt: 0,
      }),
      JSON.stringify({
        version: 1,
        analytics: true,
        marketing: true,
        updatedAt: 1_900_000_000_000,
      }),
    ]) {
      const { store } = setup(raw);
      expect(store.current()).toMatchObject({
        ready: false,
        analytics: false,
        marketing: false,
      });
      store.load();
      expect(store.current()).toMatchObject({
        ready: true,
        analytics: false,
        marketing: false,
      });
    }
  });

  it("persists independent choices, expires active-tab grants and enforces GPC over a prior grant", () => {
    const s = setup();
    s.store.load();
    expect(s.store.save({ analytics: true, marketing: false })).toBe(true);
    expect(s.store.current()).toMatchObject({
      analytics: true,
      marketing: false,
    });
    s.store.load();
    expect(s.store.current()).toMatchObject({
      analytics: true,
      marketing: false,
    });
    s.store.save({ analytics: true, marketing: true });
    s.setGpc(true);
    expect(s.store.current()).toMatchObject({
      analytics: true,
      marketing: false,
      gpc: true,
    });
    s.store.save({ analytics: true, marketing: true });
    expect(JSON.parse(s.data.get(CONSENT_KEY)!)).toMatchObject({
      analytics: true,
      marketing: false,
    });
    s.setTime(s.now() + CONSENT_LIFETIME_MS);
    expect(s.store.current()).toMatchObject({
      analytics: false,
      marketing: false,
    });
  });

  it("syncs external changes and keeps collection denied when persistence fails", () => {
    const s = setup();
    s.store.load();
    s.store.save({ analytics: true, marketing: true });
    s.data.set(
      CONSENT_KEY,
      JSON.stringify({
        version: 1,
        updatedAt: s.now(),
        analytics: false,
        marketing: false,
      }),
    );
    s.store.load();
    expect(s.store.current()).toMatchObject({
      analytics: false,
      marketing: false,
    });
    s.store.save({ analytics: true, marketing: true });
    s.block();
    expect(s.store.save({ analytics: false, marketing: false })).toBe(false);
    expect(s.store.current()).toMatchObject({
      analytics: false,
      marketing: false,
    });
    expect(s.store.getSnapshot().error).toMatch(/could not be saved/i);
    s.store.load();
    expect(s.store.current()).toMatchObject({
      analytics: false,
      marketing: false,
    });
  });
});
