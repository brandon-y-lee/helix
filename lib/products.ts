// Original placeholder catalog for the Mei Pelle development storefront.
// All product names, copy, and pricing are invented for development use only.

export type Variant = {
  id: string;
  label: string;
  /** Price in whole USD cents. */
  price: number;
};

export type Product = {
  slug: string;
  name: string;
  tagline: string;
  collection: string;
  /** Short marketing blurb shown on cards. */
  blurb: string;
  /** Longer description shown on the detail page. */
  description: string;
  /** Key benefits / "what it does" bullets. */
  benefits: string[];
  /** How-to-use guidance. */
  howToUse: string;
  variants: Variant[];
  /** Decorative gradient stops used in place of product photography. */
  swatch: [string, string];
};

export const products: Product[] = [
  {
    slug: "groundwork-gel-cleanser",
    name: "Groundwork Gel Cleanser",
    tagline: "Daily clarifying wash",
    collection: "Cleanse",
    blurb: "A low-foam gel that lifts grit and excess oil without stripping.",
    description:
      "Groundwork is the first step in the routine — a balanced gel cleanser formulated to clear away sweat, sunscreen, and the day without leaving skin tight. It rinses clean and leaves a calm, prepared surface for everything that follows.",
    benefits: [
      "Dissolves oil and daily buildup",
      "Maintains the skin barrier",
      "Leaves no residue or tightness",
    ],
    howToUse:
      "Massage a small amount onto damp skin morning and night. Rinse with lukewarm water and pat dry.",
    variants: [
      { id: "100ml", label: "100 ml", price: 2400 },
      { id: "200ml", label: "200 ml", price: 3800 },
    ],
    swatch: ["#dfe7e2", "#b9c9bf"],
  },
  {
    slug: "meridian-daily-moisturizer",
    name: "Meridian Daily Moisturizer",
    tagline: "Lightweight all-day hydration",
    collection: "Hydrate",
    blurb: "A fast-absorbing lotion that hydrates without weight or shine.",
    description:
      "Meridian is a featherweight daily moisturizer built for skin that should never look greasy. It delivers lasting hydration, smooths texture, and settles in seconds so it disappears under sunscreen or a clean shave.",
    benefits: [
      "All-day, non-greasy hydration",
      "Smooths and softens texture",
      "Layers cleanly under SPF",
    ],
    howToUse:
      "Apply an even layer to clean skin morning and night. Follow with sunscreen during the day.",
    variants: [
      { id: "50ml", label: "50 ml", price: 3200 },
      { id: "75ml", label: "75 ml", price: 4400 },
    ],
    swatch: ["#e7e2da", "#cabfa9"],
  },
  {
    slug: "northpoint-renewal-serum",
    name: "Northpoint Renewal Serum",
    tagline: "Overnight resurfacing concentrate",
    collection: "Treat",
    blurb: "A nightly serum that refines tone and softens fine lines.",
    description:
      "Northpoint is the workhorse of the routine — a concentrated overnight serum that supports cell turnover, evens tone, and gradually softens the look of fine lines. Skin wakes up smoother, clearer, and more even with consistent use.",
    benefits: [
      "Refines tone and texture overnight",
      "Softens the look of fine lines",
      "Supports a brighter, more even finish",
    ],
    howToUse:
      "Apply a few drops to clean, dry skin at night. Start every other night and build to nightly. Always wear SPF the next morning.",
    variants: [
      { id: "30ml", label: "30 ml", price: 5400 },
      { id: "50ml", label: "50 ml", price: 7800 },
    ],
    swatch: ["#e3ddea", "#c2b5d6"],
  },
  {
    slug: "summit-mineral-spf",
    name: "Summit Mineral Defense SPF 40",
    tagline: "Invisible mineral sunscreen",
    collection: "Protect",
    blurb: "A weightless mineral SPF that leaves no white cast.",
    description:
      "Summit is broad-spectrum mineral protection engineered to vanish on skin. It shields against daily UV exposure without the chalky finish or heavy feel, making it easy to wear every single day.",
    benefits: [
      "Broad-spectrum SPF 40 protection",
      "No white cast or heavy feel",
      "Sits cleanly over moisturizer",
    ],
    howToUse:
      "Apply generously as the last step of your morning routine. Reapply every two hours with sun exposure.",
    variants: [
      { id: "50ml", label: "50 ml", price: 3600 },
    ],
    swatch: ["#eee6d6", "#d8c79e"],
  },
  {
    slug: "lowtide-recovery-cream",
    name: "Lowtide Overnight Recovery Cream",
    tagline: "Rich restorative night cream",
    collection: "Hydrate",
    blurb: "A cushioning night cream that restores while you sleep.",
    description:
      "Lowtide is a richer, more occlusive cream for the end of the day. It seals in moisture, supports overnight repair, and leaves dry or stressed skin feeling comfortable and replenished by morning.",
    benefits: [
      "Deep overnight replenishment",
      "Comforts dry, stressed skin",
      "Strengthens the moisture barrier",
    ],
    howToUse:
      "Smooth a generous layer over skin as the final step of your evening routine.",
    variants: [
      { id: "50ml", label: "50 ml", price: 4200 },
      { id: "75ml", label: "75 ml", price: 5600 },
    ],
    swatch: ["#dee4ea", "#aebccb"],
  },
  {
    slug: "clearview-eye-concentrate",
    name: "Clearview Eye Concentrate",
    tagline: "De-puffing eye treatment",
    collection: "Treat",
    blurb: "A cooling concentrate that targets puffiness and fatigue.",
    description:
      "Clearview is a focused treatment for the eye area — a lightweight concentrate that helps reduce the look of puffiness, dark circles, and fatigue so you look more rested even when you aren't.",
    benefits: [
      "Reduces the look of puffiness",
      "Brightens tired-looking eyes",
      "Absorbs fast, layers easily",
    ],
    howToUse:
      "Dab a small amount around the orbital bone morning and night. Pat gently until absorbed.",
    variants: [
      { id: "15ml", label: "15 ml", price: 4800 },
    ],
    swatch: ["#e2eae8", "#aecbc6"],
  },
];

export function getProduct(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
