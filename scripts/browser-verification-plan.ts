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
    { capabilities: ["Catalog Preview"], prefix: "app/admin/catalog/preview/" },
    {
      capabilities: ["Catalog Preview"],
      prefix: "components/admin/CatalogPreviewToolbar.tsx",
    },
    { capabilities: ["Catalog Preview"], prefix: "lib/catalog-editor/preview-" },
    {
      capabilities: ["Product Discovery"],
      prefix: "components/home/HomeBeyondCoreShowcase.tsx",
    },
    {
      capabilities: ["Product Discovery"],
      prefix: "components/home/HomeCoreShowcase.tsx",
    },
    {
      capabilities: ["Product Discovery"],
      prefix: "components/home/HomePhasedDescription.tsx",
    },
    {
      capabilities: ["Product Discovery"],
      prefix: "components/home/HomePrinciplesPortrait.tsx",
    },
    {
      capabilities: ["Product Discovery"],
      prefix: "components/home/HomeThreePrinciples.tsx",
    },
    { capabilities: ["Product Discovery"], prefix: "components/product/" },
    {
      capabilities: ["Focus", "Touch", "Responsive Overlay"],
      prefix: "components/product/ProductCard.tsx",
    },
    { capabilities: ["Product Discovery"], prefix: "lib/catalog/discovery.ts" },
    { capabilities: ["Platform Navigation"], prefix: "app/about/" },
    { capabilities: ["Platform Navigation"], prefix: "components/content/" },
    {
      capabilities: ["Platform Navigation"],
      prefix: "components/shell/SiteFooter.tsx",
    },
    {
      capabilities: ["Accessibility Interaction"],
      prefix: "app/accessibility/",
    },
    { capabilities: ["Focus"], prefix: "components/overlays/Sheet.tsx" },
    {
      capabilities: ["Media"],
      prefix: "components/home/HomeBackgroundVideo.tsx",
    },
    {
      capabilities: ["Media", "Sticky Layout"],
      prefix: "components/product-detail/PdpRoutineVideo.tsx",
    },
    {
      capabilities: ["Scroll"],
      prefix: "components/home/useScrollDirectionZoom.ts",
    },
    {
      capabilities: [
        "Platform Navigation",
        "Focus",
        "Scroll",
        "Responsive Overlay",
      ],
      prefix: "components/shell/Header.tsx",
    },
    {
      capabilities: ["Routine Navigation", "Focus", "Scroll"],
      prefix: "components/system/",
    },
    { capabilities: ["Routine Navigation"], prefix: "app/system/" },
    { capabilities: ["Product Search"], prefix: "components/search/" },
    {
      capabilities: ["Product Search", "Focus", "Responsive Overlay"],
      prefix: "components/search/SearchOverlay.tsx",
    },
    { capabilities: ["Product Search"], prefix: "app/search/" },
    { capabilities: ["Product Search"], prefix: "lib/algolia/" },
    { capabilities: ["PDP Purchase"], prefix: "components/product-detail/" },
    { capabilities: ["PDP Purchase"], prefix: "app/products/" },
    { capabilities: ["Cart"], prefix: "components/cart/" },
    { capabilities: ["Cart"], prefix: "app/api/cart/" },
    { capabilities: ["Cart"], prefix: "app/cart/" },
    { capabilities: ["Cart"], prefix: "lib/cart/" },
    {
      capabilities: ["Product Discovery", "Touch", "Responsive Overlay"],
      prefix: "components/product/ShopBrowser.tsx",
    },
  ],
  projects: ["chromium", "webkit"],
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
