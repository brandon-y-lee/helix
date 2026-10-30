export const CONSENT_KEY = "helix_privacy_choices";
export const CONSENT_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
export type PrivacyChoices = { analytics: boolean; marketing: boolean };
export type ConsentSnapshot = PrivacyChoices & {
  ready: boolean;
  saved: boolean;
  gpc: boolean;
  error: string | null;
};
type RecordValue = PrivacyChoices & { version: 1; updatedAt: number };
type Options = {
  storage: () => Pick<Storage, "getItem" | "setItem"> | undefined;
  now: () => number;
  gpc: () => boolean;
};
export const SERVER_CONSENT: ConsentSnapshot = Object.freeze({
  ready: false,
  saved: false,
  analytics: false,
  marketing: false,
  gpc: false,
  error: null,
});

export function createConsentStore(options: Options) {
  let snapshot = SERVER_CONSENT;
  let record: RecordValue | null = null;
  let failedSave = false;
  const listeners = new Set<() => void>();
  function current(): ConsentSnapshot {
    const valid =
      record !== null &&
      options.now() >= record.updatedAt &&
      options.now() - record.updatedAt < CONSENT_LIFETIME_MS;
    const gpc = options.gpc();
    return {
      ...snapshot,
      gpc,
      saved: valid,
      analytics: valid && record!.analytics,
      marketing: valid && record!.marketing && !gpc,
    };
  }
  function publish(next: ConsentSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => snapshot,
    current,
    expiresAt: () => (record ? record.updatedAt + CONSENT_LIFETIME_MS : null),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load() {
      if (failedSave) return;
      record = null;
      try {
        const raw = options.storage()?.getItem(CONSENT_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const value = parsed as Partial<RecordValue>;
          if (
            value.version === 1 &&
            typeof value.analytics === "boolean" &&
            typeof value.marketing === "boolean" &&
            typeof value.updatedAt === "number" &&
            Number.isFinite(value.updatedAt)
          ) {
            record = value as RecordValue;
          }
        }
      } catch {
        record = null;
      } // Browser storage may be blocked; never infer a grant.
      snapshot = { ...SERVER_CONSENT, ready: true };
      publish(current());
    },
    save(choices: PrivacyChoices) {
      const next: RecordValue = {
        version: 1,
        updatedAt: options.now(),
        analytics: choices.analytics,
        marketing: choices.marketing && !options.gpc(),
      };
      try {
        const storage = options.storage();
        if (!storage) throw new Error("Storage unavailable");
        storage.setItem(CONSENT_KEY, JSON.stringify(next));
        failedSave = false;
        record = next;
        snapshot = { ...SERVER_CONSENT, ready: true };
        publish(current());
        return true;
      } catch {
        failedSave = true;
        record = null;
        publish({
          ...SERVER_CONSENT,
          ready: true,
          gpc: options.gpc(),
          error:
            "Your choices could not be saved. Optional services are off on this page. Check your browser storage settings and try again.",
        });
        return false;
      }
    },
  };
}

export function browserGpc(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "globalPrivacyControl" in navigator &&
    navigator.globalPrivacyControl === true
  );
}
export const privacyConsent = createConsentStore({
  storage: () =>
    typeof window === "undefined" ? undefined : window.localStorage,
  now: Date.now,
  gpc: browserGpc,
});
