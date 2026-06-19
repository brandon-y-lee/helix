export const ABOUT_HERO = {
  eyebrow: "SEOUL / LOS ANGELES",
  title: "TWO CITIES. ONE STANDARD.",
  body:
    "Mei-Pelle brings South Korean formulation discipline together with Los Angeles self-invention: an edited skincare system built for men who expect more from how they look, feel, and move through the world.",
  primaryCta: { label: "Discover the method", href: "/method" },
  secondaryCta: { label: "Shop the system", href: "/products" },
};

export const ABOUT_OPENING = [
  "Mei-Pelle exists between two beauty cultures, not as a costume of either one. From South Korean skincare we take precision, iteration, thoughtful layering, sensorial formulas, and the belief that skin is maintained before it has to be corrected.",
  "From Los Angeles we take individuality, visible ambition, performance, cultural range, and the confidence to treat appearance as one part of a larger practice of self-development.",
  "The translation is deliberately simple: fewer decisions, purposeful compounds, clear instructions, and formulas that have to earn their place in the routine.",
];

export const CULTURE_PANELS = [
  {
    city: "SEOUL",
    heading: "PRECISION IS A PRACTICE.",
    tone: "cool",
    points: [
      "Formulation discipline",
      "Barrier awareness",
      "Ingredient literacy",
      "Routine consistency",
      "Refinement through iteration",
    ],
    body:
      "The Seoul influence is not a stereotype. It is a design principle: study the formula, respect the order, and make the experience elegant enough to repeat.",
  },
  {
    city: "LOS ANGELES",
    heading: "POTENTIAL IS PERSONAL.",
    tone: "warm",
    points: [
      "Self-expression",
      "Visible ambition",
      "Efficient routines",
      "Sun-conscious living",
      "A broader definition of masculinity",
    ],
    body:
      "The Los Angeles influence is movement: work, training, heat, travel, night life, and the freedom to decide what maintenance means for yourself.",
  },
] as const;

export const WHY_MEN = {
  eyebrow: "WHY MEN",
  heading: "MEN DESERVE A BETTER SYSTEM.",
  statement:
    "YOUR FACE IS PART OF HOW YOU MOVE THROUGH THE WORLD. CARE FOR IT ACCORDINGLY.",
  body:
    "Men have often been offered either basic grooming stripped of serious skincare, or complicated routines that assume years of beauty literacy. Mei-Pelle occupies the space between them: sophisticated but understandable, elevated but usable, ingredient-aware without becoming clinical, ambitious without shame.",
};

export const STANDARD_PRINCIPLES = [
  {
    title: "PRECISION OVER EXCESS",
    body:
      "Every product and every step needs a defined job. Complexity is not a measure of quality.",
  },
  {
    title: "SKIN HEALTH BEFORE HYPE",
    body:
      "The system should support comfort, barrier integrity, hydration, texture, and long-term consistency before chasing novelty.",
  },
  {
    title: "ADVANCED, EXPLAINED",
    body:
      "Modern compounds deserve plain language, careful claims, and transparent context.",
  },
  {
    title: "PERFORMANCE YOU WILL REPEAT",
    body:
      "The best routine is not the longest. It is the one that fits real mornings, real nights, travel, work, training, and life.",
  },
  {
    title: "PROGRESS WITH LESS WASTE",
    body:
      "Build fewer, more useful products. Reduce redundant steps. Improve packaging and sourcing through concrete, documented choices rather than vague environmental language.",
  },
];

export const QUALITY_POINTS = [
  "Every highlighted ingredient needs a reason to be present.",
  "Compatibility, delivery format, texture, and tolerability matter as much as concentration.",
  "Advanced ingredients should coexist with barrier support, not replace it.",
  "Supplier facts stay separate from brand poetry.",
  "Complete ingredient transparency remains the goal whenever source records support it.",
];

export const SUSTAINABILITY = {
  heading: "LESS, DONE BETTER.",
  body:
    "Sustainability is not a badge. It is an operating discipline we intend to measure, document, and improve.",
  points: [
    "Fewer overlapping products.",
    "Multifunctional formulas where appropriate.",
    "A long-lived core assortment instead of constant churn.",
    "Purposeful packaging and supplier provenance as documented goals.",
    "Transparent progress rather than perfection claims.",
  ],
};

export const BRAND_PROMISES = [
  "SIMPLE ENOUGH TO FOLLOW.",
  "SERIOUS ENOUGH TO MATTER.",
  "DESIGNED TO EVOLVE WITH YOU.",
];

export const ABOUT_CLOSING = {
  heading: "ASCEND, DELIBERATELY.",
  body:
    "Potential is not a promise made by a product. It is the result of standards repeated.",
  primaryCta: { label: "Learn the method", href: "/method" },
  secondaryCta: { label: "Shop Mei-Pelle", href: "/products" },
};

export const FORBIDDEN_ABOUT_PATTERNS = [
  "founder",
  "advisor",
  "advisory board",
  "certified sustainable",
  "dermatologist developed",
  "clinical partner",
  "carbon neutral",
  "zero waste",
  "reef safe",
] as const;
