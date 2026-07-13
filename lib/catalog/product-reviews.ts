export type ProductResponseMeter = {
  question: string;
  lowLabel: string;
  highLabel: string;
};

export type ProductReviewFixture = {
  id: string;
  initials: string;
  firstName: string;
  ageRange: string;
  skinType: string;
  primaryConcern: string;
  routineContext: string;
  favoriteFeatures: string[];
  rating: number;
  date: string;
  title: string;
  body: string;
  meterValue: number;
};

export type ProductReviews = {
  meter: ProductResponseMeter;
  reviews: ProductReviewFixture[];
};

const meters = {
  "cleanse-01-calming-gel-cleanser": {
    question: "How clean did your skin feel without tightness?",
    lowLabel: "Stripped",
    highLabel: "Clean and comfortable",
  },
  "treat-03-pdrn-5-ampoule": {
    question: "How refreshed did your skin look?",
    lowLabel: "Flat",
    highLabel: "Switched on",
  },
  "seal-05-green-collagen-cream": {
    question: "How comfortable did your skin feel by the end of the day?",
    lowLabel: "Dry by noon",
    highLabel: "Comfort held",
  },
  "refine-02-pore-treatment-pads": {
    question: "How smooth did texture look?",
    lowLabel: "Still uneven",
    highLabel: "Noticeably smoother",
  },
  "frame-04-pdrn-eye-cream": {
    question: "How awake did the eye area look?",
    lowLabel: "Still tired",
    highLabel: "More awake",
  },
  "lift-06-pdrn-mask-system": {
    question: "How refreshed did your skin feel?",
    lowLabel: "No refresh",
    highLabel: "Fully refreshed",
  },
} as const satisfies Record<string, ProductResponseMeter>;

const sharedReviews = {
  coreDaily: [
    "Fits the morning routine without turning the sink into a project.",
    "The finish is clean but not overdone, which makes the next layer easier.",
  ],
  beyondMeasured: [
    "Useful when the daily three steps are already handled.",
    "It feels like an intentional add-on, not another permanent obligation.",
  ],
};

// Original Mei Pelle placeholder fixtures for non-production review-section QA.
export const productReviewFixturesBySlug = {
  "cleanse-01-calming-gel-cleanser": {
    meter: meters["cleanse-01-calming-gel-cleanser"],
    reviews: [
      {
        id: "cleanse-marco",
        initials: "MR",
        firstName: "Marco",
        ageRange: "25-34",
        skinType: "Combination",
        primaryConcern: "SPF and city buildup",
        routineContext: "Morning and night Core routine",
        favoriteFeatures: ["No tight finish", "Easy rinse", "Clean start"],
        rating: 5,
        date: "2026-04-18",
        title: "Clean without the squeak",
        body: sharedReviews.coreDaily[0],
        meterValue: 92,
      },
      {
        id: "cleanse-devin",
        initials: "DK",
        firstName: "Devin",
        ageRange: "35-44",
        skinType: "Normal",
        primaryConcern: "Late-night buildup",
        routineContext: "Night routine before TREAT",
        favoriteFeatures: ["Balanced feel", "Routine prep", "Soft finish"],
        rating: 4,
        date: "2026-04-24",
        title: "Makes the rest easier",
        body: sharedReviews.coreDaily[1],
        meterValue: 86,
      },
    ],
  },
  "treat-03-pdrn-5-ampoule": {
    meter: meters["treat-03-pdrn-5-ampoule"],
    reviews: [
      {
        id: "treat-alex",
        initials: "AC",
        firstName: "Alex",
        ageRange: "25-34",
        skinType: "Dry-leaning",
        primaryConcern: "Dull-looking skin",
        routineContext: "After CLEANSE, before SEAL",
        favoriteFeatures: ["Fast absorption", "Hydrated finish", "No stickiness"],
        rating: 5,
        date: "2026-05-03",
        title: "A sharper finish",
        body: "The layer disappears quickly and leaves skin looking more awake without shine.",
        meterValue: 90,
      },
      {
        id: "treat-jules",
        initials: "JR",
        firstName: "Jules",
        ageRange: "25-34",
        skinType: "Combination",
        primaryConcern: "Uneven-looking texture",
        routineContext: "Core routine, morning and night",
        favoriteFeatures: ["Lightweight", "Easy to layer", "Comfortable"],
        rating: 4,
        date: "2026-05-11",
        title: "Does not slow the routine down",
        body: "It feels concentrated but still clean, which is exactly where the treatment step should land.",
        meterValue: 84,
      },
    ],
  },
  "seal-05-green-collagen-cream": {
    meter: meters["seal-05-green-collagen-cream"],
    reviews: [
      {
        id: "seal-nico",
        initials: "NS",
        firstName: "Nico",
        ageRange: "25-34",
        skinType: "Normal",
        primaryConcern: "End-of-day dryness",
        routineContext: "Last Core step",
        favoriteFeatures: ["Comfort hold", "Clean finish", "Not heavy"],
        rating: 5,
        date: "2026-05-18",
        title: "The finish stays composed",
        body: "It gives the routine a clean stop point and keeps skin comfortable through the day.",
        meterValue: 88,
      },
      {
        id: "seal-eli",
        initials: "EW",
        firstName: "Eli",
        ageRange: "35-44",
        skinType: "Dry",
        primaryConcern: "Comfort after serum",
        routineContext: "Night Core routine",
        favoriteFeatures: ["Cushion", "No overload", "Soft finish"],
        rating: 4,
        date: "2026-05-21",
        title: "A controlled last layer",
        body: "Enough moisture to feel complete without making the routine look glossy.",
        meterValue: 83,
      },
    ],
  },
  "refine-02-pore-treatment-pads": {
    meter: meters["refine-02-pore-treatment-pads"],
    reviews: [
      {
        id: "refine-miles",
        initials: "MT",
        firstName: "Miles",
        ageRange: "25-34",
        skinType: "Oily-combination",
        primaryConcern: "Uneven texture",
        routineContext: "Beyond The Core twice weekly",
        favoriteFeatures: ["Measured format", "Smoother look", "Fresh finish"],
        rating: 4,
        date: "2026-06-02",
        title: "Better when used deliberately",
        body: sharedReviews.beyondMeasured[0],
        meterValue: 80,
      },
      {
        id: "refine-kai",
        initials: "KL",
        firstName: "Kai",
        ageRange: "25-34",
        skinType: "Combination",
        primaryConcern: "Surface roughness",
        routineContext: "Night add-on before The Core",
        favoriteFeatures: ["Controlled cadence", "Quick use", "Cleaner surface"],
        rating: 4,
        date: "2026-06-05",
        title: "Not an everyday thing",
        body: sharedReviews.beyondMeasured[1],
        meterValue: 78,
      },
    ],
  },
  "frame-04-pdrn-eye-cream": {
    meter: meters["frame-04-pdrn-eye-cream"],
    reviews: [
      {
        id: "frame-owen",
        initials: "OH",
        firstName: "Owen",
        ageRange: "25-34",
        skinType: "Normal",
        primaryConcern: "Tired-looking eye area",
        routineContext: "Beyond The Core in the morning",
        favoriteFeatures: ["Targeted", "Lightweight", "Clean finish"],
        rating: 4,
        date: "2026-06-09",
        title: "A sharper frame",
        body: "It keeps the eye-area step focused instead of feeling like another full-face layer.",
        meterValue: 82,
      },
      {
        id: "frame-sam",
        initials: "SP",
        firstName: "Sam",
        ageRange: "35-44",
        skinType: "Sensitive-leaning",
        primaryConcern: "Late nights",
        routineContext: "As-needed add-on",
        favoriteFeatures: ["Small amount", "Comfortable", "Rested look"],
        rating: 4,
        date: "2026-06-13",
        title: "Easy to keep precise",
        body: "The texture makes it simple to use around the eye area without overapplying.",
        meterValue: 79,
      },
    ],
  },
  "lift-06-pdrn-mask-system": {
    meter: meters["lift-06-pdrn-mask-system"],
    reviews: [
      {
        id: "lift-luca",
        initials: "LA",
        firstName: "Luca",
        ageRange: "25-34",
        skinType: "Dry-leaning",
        primaryConcern: "Weekly extra support",
        routineContext: "Beyond The Core once weekly",
        favoriteFeatures: ["Treatment moment", "Hydrated feel", "Return to Core"],
        rating: 5,
        date: "2026-06-18",
        title: "A weekly pause",
        body: "It feels like a scheduled intensive, then the routine goes right back to the simple three.",
        meterValue: 87,
      },
      {
        id: "lift-mateo",
        initials: "MV",
        firstName: "Mateo",
        ageRange: "35-44",
        skinType: "Normal",
        primaryConcern: "Pre-event skin fatigue",
        routineContext: "Night before a long day",
        favoriteFeatures: ["Composed finish", "Extra hydration", "Easy cadence"],
        rating: 4,
        date: "2026-06-21",
        title: "Extra without becoming daily",
        body: "The best part is that it does not make the rest of the week more complicated.",
        meterValue: 81,
      },
    ],
  },
} as const satisfies Record<string, ProductReviews>;

export function getProductReviews(slug: string): ProductReviews {
  return (
    productReviewFixturesBySlug[
      slug as keyof typeof productReviewFixturesBySlug
    ] ?? {
      meter: {
        question: "How well did this fit your routine?",
        lowLabel: "Not useful",
        highLabel: "Easy to repeat",
      },
      reviews: [],
    }
  );
}

export function reviewSummary(reviews: ProductReviewFixture[]) {
  if (reviews.length === 0) return { average: 0, count: 0 };
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return { average: total / reviews.length, count: reviews.length };
}
