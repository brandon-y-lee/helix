export type PdpIngredientCard = {
  name: string;
  label: string;
  copy: string;
};

export type PdpIngredientHighlight = {
  name: string;
  description: string;
};

export type PdpIngredientStory = {
  heading: string;
  intro: string;
  highlights: readonly [
    PdpIngredientHighlight,
    PdpIngredientHighlight,
  ];
  supportingIngredients: string;
};

export type ProductPdpContent = {
  whatItDoes: string[];
  howToUseSteps: string[];
  ingredientCards: PdpIngredientCard[];
  ingredientStory?: PdpIngredientStory;
};

export const productPdpContentBySlug = {
  "cleanse-01-calming-gel-cleanser": {
    whatItDoes: ["CLEAR", "BALANCE", "PREP"],
    howToUseSteps: [
      "Massage onto damp skin morning or night.",
      "Rinse thoroughly without chasing a tight finish.",
      "Follow with TREAT or the next step your routine needs.",
    ],
    ingredientCards: [
      {
        name: "Multi-biotics complex",
        label: "Routine-friendly cleanse",
        copy: "Supports a balanced cleansing step that keeps the routine easy to repeat.",
      },
      {
        name: "6-Type Cica Complex",
        label: "Calm-looking skin support",
        copy: "A centella-led system used for a composed, comfortable-looking finish after rinsing.",
      },
      {
        name: "LHA",
        label: "Surface polish",
        copy: "A gentle-feeling supporting ingredient used here for a cleaner-looking surface.",
      },
      {
        name: "Green tea + centella notes",
        label: "Fresh finish",
        copy: "Plant-based cosmetic support for a clean, non-stripped first step.",
      },
    ],
    ingredientStory: {
      heading: "what’s inside",
      intro:
        "Get to know the ingredients that help the first step feel clean, calm, and comfortable.",
      highlights: [
        {
          name: "6-TYPE CICA COMPLEX",
          description:
            "a centella-focused blend used to help skin feel soothed and balanced while you cleanse",
        },
        {
          name: "LHA",
          description:
            "a lipophilic hydroxy acid used to help lift surface buildup and refine the feel of texture",
        },
      ],
      supportingIngredients:
        "also made with MULTI-BIOTICS COMPLEX, GREEN TEA",
    },
  },
  "treat-03-pdrn-5-ampoule": {
    whatItDoes: ["HYDRATE", "SMOOTH", "WAKE UP THE FINISH"],
    howToUseSteps: [
      "After cleansing and toner or essence, apply 2-3 drops.",
      "Press into skin for 30-60 seconds.",
      "Follow with moisturizer.",
      "Use SPF in daytime. Use morning and night.",
    ],
    ingredientCards: [
      {
        name: "PDRN / Sodium DNA — 50,000 ppm",
        label: "High-focus conditioning signal",
        copy: "A concentrated cosmetic ingredient used here for hydration support, smoother-looking texture, and a more vital-looking finish.",
      },
      {
        name: "Niacinamide",
        label: "Tone + radiance support",
        copy: "A routine staple for a more even-looking tone and refined radiance.",
      },
      {
        name: "Trehalose + humectant base",
        label: "Water-binding comfort",
        copy: "Helps keep the serum comfortable, hydrated, and easy to layer.",
      },
      {
        name: "Peptide complex",
        label: "Resilient-looking skin",
        copy: "A multi-peptide blend used for smoother, more conditioned-looking skin.",
      },
      {
        name: "Adenosine",
        label: "Fine-line appearance support",
        copy: "A K-beauty familiar used here for a smoother-looking finish.",
      },
    ],
    ingredientStory: {
      heading: "what’s inside",
      intro:
        "Get to know the ingredients behind lightweight hydration and a smoother, more awake-looking finish.",
      highlights: [
        {
          name: "PDRN / SODIUM DNA 50,000 PPM",
          description:
            "a concentrated conditioning ingredient used to support hydrated, smoother-looking skin",
        },
        {
          name: "NIACINAMIDE",
          description:
            "a form of vitamin B3 that helps refine the look of uneven tone and support visible radiance",
        },
      ],
      supportingIngredients:
        "also made with TREHALOSE, PEPTIDE COMPLEX, ADENOSINE",
    },
  },
  "seal-05-green-collagen-cream": {
    whatItDoes: ["CUSHION", "COMFORT", "HOLD"],
    howToUseSteps: [
      "Smooth over face and neck as the final Mei Pelle step at night.",
      "Use before SPF in the morning.",
      "Layer over TREAT when skin wants added comfort.",
    ],
    ingredientCards: [
      {
        name: "Green collagen complex",
        label: "Cushioned cosmetic feel",
        copy: "Used for a plush skin feel and hydrated-looking finish; it does not become human dermal collagen.",
      },
      {
        name: "Sodium hyaluronate",
        label: "Hydration support",
        copy: "A humectant used to help the cream leave skin feeling comfortable.",
      },
      {
        name: "Panthenol",
        label: "Comfort support",
        copy: "A familiar conditioning ingredient for a calmer-feeling final layer.",
      },
      {
        name: "Niacinamide",
        label: "Tone + finish support",
        copy: "Supports a more even-looking, composed finish in a daily moisturizer.",
      },
    ],
    ingredientStory: {
      heading: "what’s inside",
      intro:
        "Get to know the ingredients that help hold hydration close and keep the final layer comfortable.",
      highlights: [
        {
          name: "GREEN COLLAGEN COMPLEX",
          description:
            "a moisture-focused complex used to help skin feel cushioned and look smoother",
        },
        {
          name: "PANTHENOL",
          description:
            "a form of provitamin B5 that helps skin feel calm and comfortable",
        },
      ],
      supportingIngredients:
        "also made with SODIUM HYALURONATE, NIACINAMIDE",
    },
  },
  "refine-02-pore-treatment-pads": {
    whatItDoes: ["SMOOTH", "CLARIFY", "CONTROL"],
    howToUseSteps: [
      "Swipe one pad over clean, dry skin.",
      "Start a few times weekly, then build only as skin allows.",
      "Follow with hydration and use SPF in daytime.",
    ],
    ingredientCards: [
      {
        name: "Panthenol + betaine",
        label: "Comfort-first base",
        copy: "Helps keep a deliberate texture step from feeling overly stripped.",
      },
      {
        name: "Sodium hyaluronate",
        label: "Hydration support",
        copy: "Adds water-binding support so the finish stays more comfortable.",
      },
      {
        name: "Plum + marine extracts",
        label: "Conditioning support",
        copy: "A botanical and marine complex used for a fresher-looking surface.",
      },
      {
        name: "Dual-sided pad format",
        label: "Controlled application",
        copy: "A measured delivery format that keeps this beyond-core step intentional.",
      },
    ],
  },
  "frame-04-pdrn-eye-cream": {
    whatItDoes: ["FOCUS", "WAKE", "SHARPEN"],
    howToUseSteps: [
      "Tap a small amount around the orbital area with your ring finger.",
      "Keep product away from the lash line to avoid migration.",
      "Use before moisturizer when the eye area needs a focused step.",
    ],
    ingredientCards: [
      {
        name: "Sodium DNA",
        label: "Eye-area conditioning",
        copy: "A cosmetic conditioning ingredient used here for a smoother-looking eye area.",
      },
      {
        name: "Niacinamide",
        label: "Brighter-looking frame",
        copy: "Supports a cleaner, more even-looking finish around the eye area.",
      },
      {
        name: "Panthenol + allantoin",
        label: "Comfort support",
        copy: "Helps keep the targeted step comfortable for repeat use.",
      },
      {
        name: "Peptide eye blend",
        label: "Conditioned-looking contour",
        copy: "A focused blend used for a smoother, more rested-looking impression.",
      },
    ],
  },
  "lift-06-pdrn-mask-system": {
    whatItDoes: ["REFRESH", "INTENSIFY", "RETURN"],
    howToUseSteps: [
      "Apply to clean skin for the product-supported wear time.",
      "Remove the sheet and press in remaining essence.",
      "Return to The Core instead of adding another daily requirement.",
    ],
    ingredientCards: [
      {
        name: "Sodium DNA — 5,000 ppm",
        label: "Weekly conditioning signal",
        copy: "A cosmetic conditioning ingredient used for a hydrated, smoother-looking finish.",
      },
      {
        name: "Niacinamide",
        label: "Radiance support",
        copy: "Supports a more even-looking tone after the weekly treatment moment.",
      },
      {
        name: "Hydrolyzed collagen",
        label: "Cushioned sheet experience",
        copy: "A cosmetic ingredient used for skin feel and hydration support, not dermal collagen replacement.",
      },
      {
        name: "Adenosine + allantoin",
        label: "Smooth comfort",
        copy: "Helps the intensive feel composed while supporting a smoother-looking finish.",
      },
    ],
  },
} as const satisfies Record<string, ProductPdpContent>;

export function getProductPdpContent(slug: string): ProductPdpContent {
  return (
    productPdpContentBySlug[slug as keyof typeof productPdpContentBySlug] ?? {
      whatItDoes: ["SUPPORT", "COMPOSE", "REPEAT"],
      howToUseSteps: ["Use as directed with the rest of your Mei Pelle routine."],
      ingredientCards: [],
    }
  );
}
