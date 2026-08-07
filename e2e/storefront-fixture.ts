import { test as base, expect } from "@playwright/test";
import {
  createStorefrontJourneys,
  type StorefrontJourneys,
} from "@/test-support/storefront-journeys";
import { loadStorefrontSnapshot } from "@/test-support/storefront-snapshot-artifact";

export const test = base.extend<{ storefront: StorefrontJourneys }>({
  storefront: async ({}, use) => {
    await use(createStorefrontJourneys(await loadStorefrontSnapshot()));
  },
});

export { expect };
