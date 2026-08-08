import { test as base, expect } from "@playwright/test";
import {
  createStorefrontJourneys,
  type StorefrontJourneys,
} from "@/test-support/storefront-journeys";
import { createProductMediaContainment } from "@/test-support/product-media-containment";
import { reconcileStorefrontSnapshot } from "@/test-support/storefront-reconciliation";
import { loadStorefrontSnapshot } from "@/test-support/storefront-snapshot-artifact";

type ProductMediaContainment = ReturnType<typeof createProductMediaContainment>;
type StorefrontFixtures = {
  productMediaContainmentPage: void;
  storefront: StorefrontJourneys;
};
type StorefrontWorkerFixtures = {
  productMediaContainment: ProductMediaContainment;
  storefrontBaseline: StorefrontJourneys;
};

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
  productMediaContainment: [async ({ storefrontBaseline }, use) => {
    const approvedMediaOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!approvedMediaOrigin) {
      throw new Error(
        "Product-media containment requires NEXT_PUBLIC_SUPABASE_URL.",
      );
    }
    const containment = createProductMediaContainment(
      storefrontBaseline.snapshot,
      { approvedMediaOrigin },
    );
    await use(containment);
    console.log(
      `e2e Product-media containment: ${JSON.stringify(containment.report())}`,
    );
  }, { scope: "worker" }],
  productMediaContainmentPage: [async ({
    page,
    productMediaContainment,
  }, use) => {
    await productMediaContainment.install(page);
    await use();
  }, { auto: true }],
  storefront: async ({ storefrontBaseline }, use) => {
    await use(storefrontBaseline);
  },
});

export { expect };
