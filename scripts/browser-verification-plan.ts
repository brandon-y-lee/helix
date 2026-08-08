export const BROWSER_VERIFICATION_PLAN = {
  journeys: [
    {
      capabilities: ["Catalog Preview", "Platform Navigation"],
      id: "catalog-preview",
      testFile: "e2e/catalog-draft-preview.spec.ts",
    },
    {
      capabilities: ["Product Discovery", "Accessibility Interaction", "Focus"],
      id: "product-discovery",
      testFile: "e2e/discovery.spec.ts",
    },
    {
      capabilities: [
        "Platform Navigation",
        "Accessibility Interaction",
        "Focus",
      ],
      id: "editorial-navigation",
      testFile: "e2e/editorial.spec.ts",
    },
    {
      capabilities: ["Platform Navigation"],
      id: "footer-support",
      testFile: "e2e/footer-support.spec.ts",
    },
    {
      capabilities: ["Media", "Responsive Overlay"],
      id: "homepage-hero",
      testFile: "e2e/home-hero.spec.ts",
    },
    {
      capabilities: [
        "Platform Navigation",
        "Focus",
        "Scroll",
        "Responsive Overlay",
      ],
      id: "header-navigation",
      testFile: "e2e/home-navbar.spec.ts",
    },
    {
      capabilities: [
        "Routine Navigation",
        "Accessibility Interaction",
        "Focus",
        "Scroll",
      ],
      id: "routine-selector",
      testFile: "e2e/method-routine-selector.spec.ts",
    },
    {
      capabilities: ["Product Search", "Focus", "Responsive Overlay"],
      id: "header-search",
      testFile: "e2e/search.spec.ts",
    },
    {
      capabilities: [
        "PDP Purchase",
        "Cart",
        "Accessibility Interaction",
        "Focus",
        "Media",
        "Scroll",
        "Touch",
        "Sticky Layout",
        "Responsive Overlay",
      ],
      id: "storefront-purchase",
      testFile: "e2e/storefront.spec.ts",
    },
  ],
  pathRules: [
    {
      capabilities: ["Catalog Preview"],
      match: "prefix",
      path: "app/admin/catalog/preview/",
    },
    {
      capabilities: ["Catalog Preview"],
      match: "exact",
      path: "components/admin/CatalogPreviewToolbar.tsx",
    },
    {
      capabilities: ["Catalog Preview"],
      match: "prefix",
      path: "lib/catalog-editor/preview-",
    },
    {
      capabilities: ["Product Discovery"],
      match: "exact",
      path: "components/home/HomeBeyondCoreShowcase.tsx",
    },
    {
      capabilities: ["Product Discovery"],
      match: "exact",
      path: "components/home/HomeCoreShowcase.tsx",
    },
    {
      capabilities: ["Product Discovery"],
      match: "exact",
      path: "components/home/HomePhasedDescription.tsx",
    },
    {
      capabilities: ["Product Discovery"],
      match: "exact",
      path: "components/home/HomePrinciplesPortrait.tsx",
    },
    {
      capabilities: ["Product Discovery"],
      match: "exact",
      path: "components/home/HomeThreePrinciples.tsx",
    },
    {
      capabilities: ["Product Discovery"],
      match: "prefix",
      path: "components/product/",
    },
    {
      capabilities: ["Focus", "Touch", "Responsive Overlay"],
      match: "exact",
      path: "components/product/ProductCard.tsx",
    },
    {
      capabilities: ["Product Discovery"],
      match: "exact",
      path: "lib/catalog/discovery.ts",
    },
    {
      capabilities: ["Platform Navigation"],
      match: "prefix",
      path: "app/about/",
    },
    {
      capabilities: ["Platform Navigation"],
      match: "prefix",
      path: "components/content/",
    },
    {
      capabilities: ["Platform Navigation"],
      match: "exact",
      path: "components/shell/SiteFooter.tsx",
    },
    {
      capabilities: ["Accessibility Interaction"],
      match: "prefix",
      path: "app/accessibility/",
    },
    {
      capabilities: ["Focus"],
      match: "exact",
      path: "components/overlays/Sheet.tsx",
    },
    {
      capabilities: ["Media"],
      match: "exact",
      path: "components/home/HomeBackgroundVideo.tsx",
    },
    {
      capabilities: ["Media", "Sticky Layout"],
      match: "exact",
      path: "components/product-detail/PdpRoutineVideo.tsx",
    },
    {
      capabilities: ["Scroll"],
      match: "exact",
      path: "components/home/useScrollDirectionZoom.ts",
    },
    {
      capabilities: [
        "Platform Navigation",
        "Focus",
        "Scroll",
        "Responsive Overlay",
      ],
      match: "exact",
      path: "components/shell/Header.tsx",
    },
    {
      capabilities: ["Routine Navigation", "Focus", "Scroll"],
      match: "prefix",
      path: "components/system/",
    },
    {
      capabilities: ["Routine Navigation"],
      match: "prefix",
      path: "app/system/",
    },
    {
      capabilities: ["Product Search"],
      match: "prefix",
      path: "components/search/",
    },
    {
      capabilities: ["Product Search", "Focus", "Responsive Overlay"],
      match: "exact",
      path: "components/search/SearchOverlay.tsx",
    },
    {
      capabilities: ["Product Search"],
      match: "prefix",
      path: "app/search/",
    },
    {
      capabilities: ["Product Search"],
      match: "prefix",
      path: "lib/algolia/",
    },
    {
      capabilities: ["PDP Purchase"],
      match: "prefix",
      path: "components/product-detail/",
    },
    {
      capabilities: ["PDP Purchase"],
      match: "prefix",
      path: "app/products/",
    },
    {
      capabilities: ["Cart"],
      match: "prefix",
      path: "components/cart/",
    },
    {
      capabilities: ["Cart"],
      match: "prefix",
      path: "app/api/cart/",
    },
    {
      capabilities: ["Cart"],
      match: "prefix",
      path: "app/cart/",
    },
    {
      capabilities: ["Cart"],
      match: "prefix",
      path: "lib/cart/",
    },
    {
      capabilities: ["Product Discovery", "Touch", "Responsive Overlay"],
      match: "exact",
      path: "components/product/ShopBrowser.tsx",
    },
  ],
  projects: [
    { device: "Desktop Chrome", name: "chromium" },
    { device: "Desktop Safari", name: "webkit" },
  ],
  webkitCapabilities: [
    "Focus",
    "Media",
    "Responsive Overlay",
    "Scroll",
    "Sticky Layout",
    "Touch",
  ],
  version: 1,
} as const;

export type BrowserVerificationJourney =
  (typeof BROWSER_VERIFICATION_PLAN.journeys)[number];
