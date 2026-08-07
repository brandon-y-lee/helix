import { test as base, expect } from "@playwright/test";
import {
  createStorefrontJourneys,
  type StorefrontJourneys,
} from "@/test-support/storefront-journeys";
import { reconcileStorefrontSnapshot } from "@/test-support/storefront-reconciliation";
import { loadStorefrontSnapshot } from "@/test-support/storefront-snapshot-artifact";

type StorefrontFixtures = { storefront: StorefrontJourneys };
type StorefrontWorkerFixtures = { storefrontBaseline: StorefrontJourneys };

export const test = base.extend<
  StorefrontFixtures,
  StorefrontWorkerFixtures
>({
  storefrontBaseline: [async ({}, use, workerInfo) => {
    const snapshot = await loadStorefrontSnapshot();
    await use(createStorefrontJourneys(snapshot));

    const baseURL = workerInfo.project.use.baseURL;
    if (typeof baseURL !== "string") {
      throw new Error(
        "Storefront snapshot reconciliation requires one Playwright base URL.",
      );
    }
    await reconcileStorefrontSnapshot(snapshot, { baseURL });
  }, { scope: "worker" }],
  storefront: async ({ storefrontBaseline }, use) => {
    await use(storefrontBaseline);
  },
});

export { expect };
