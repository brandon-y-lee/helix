export type PlaceholderPalette = {
  start: string;
  end: string;
  accent: string;
  surface: string;
  ink: string;
  highlight: string;
};

export type PresentationMediaRole =
  | "card_default"
  | "card_hover"
  | "gallery"
  | "detail"
  | "cart"
  | "search";

export type PresentationMedia = {
  role: PresentationMediaRole;
  sortOrder: number;
  paletteId: string;
  palette: PlaceholderPalette;
  alt: string;
};

export type MeiPellePresentationProduct = {
  slug: string;
  displayName: string;
  formalTitle: string;
  cardTagline: string;
  editorialDescription: string;
  editorialHowToUse: string;
  productType: string;
  routineNumber: string;
  routineStep: string;
  collection: string;
  searchKeywords: string[];
  formulaNotes: string[];
  palettes: {
    cardDefault: PlaceholderPalette;
    cardHover: PlaceholderPalette;
    galleryOne: PlaceholderPalette;
    galleryTwo: PlaceholderPalette;
    detail: PlaceholderPalette;
    utility: PlaceholderPalette;
  };
};

const ink = "#111312";
const surface = "#FFFDF8";

export const meiPellePresentationCatalog: MeiPellePresentationProduct[] = [
  {
    slug: "cleanse-01-calming-gel-cleanser",
    displayName: "CLEANSE",
    formalTitle: "CLEANSE 01 Calming Gel Cleanser",
    cardTagline: "Fresh, balanced skin",
    editorialDescription:
      "A low-pH daily cleanse that leaves skin feeling fresh, balanced, and ready for the rest of the routine.",
    editorialHowToUse:
      "Massage onto damp skin morning or night, then rinse thoroughly. Follow with REFINE or TREAT.",
    productType: "Gel cleanser",
    routineNumber: "01",
    routineStep: "Cleanse",
    collection: "THE SYSTEM",
    searchKeywords: ["cleanse", "cleanser", "daily", "gel", "balance", "reset"],
    formulaNotes: [
      "Low-pH gel-to-foam cleanser source formulation.",
      "Centella and green tea are present in the supplier ingredient deck.",
      "Designed as the first daily step in the Mei Pelle system.",
    ],
    palettes: {
      cardDefault: {
        start: "#DCE8DF",
        end: "#7E9285",
        accent: "#183D34",
        surface,
        ink,
        highlight: "#F5F1E8",
      },
      cardHover: {
        start: "#E7EFE7",
        end: "#5F7B6D",
        accent: "#12372E",
        surface,
        ink,
        highlight: "#FEF8EC",
      },
      galleryOne: {
        start: "#C8D8CF",
        end: "#496B5E",
        accent: "#173A31",
        surface,
        ink,
        highlight: "#F6F4ED",
      },
      galleryTwo: {
        start: "#ECE6DA",
        end: "#8EA395",
        accent: "#294B40",
        surface,
        ink,
        highlight: "#FFFDF6",
      },
      detail: {
        start: "#E9F1E9",
        end: "#668678",
        accent: "#1A4539",
        surface,
        ink,
        highlight: "#FAF5EA",
      },
      utility: {
        start: "#E1E9E2",
        end: "#8DA093",
        accent: "#1B4338",
        surface,
        ink,
        highlight: "#F7F2EA",
      },
    },
  },
  {
    slug: "refine-02-pore-treatment-pads",
    displayName: "REFINE",
    formalTitle: "REFINE 02 Pore Treatment Pads",
    cardTagline: "Smoother-looking texture",
    editorialDescription:
      "A daily sweep for smoother-looking texture, clearer-looking pores, and a controlled finish.",
    editorialHowToUse:
      "Swipe one pad over clean, dry skin. Start a few times weekly, then build as skin allows.",
    productType: "Toner pad",
    routineNumber: "02",
    routineStep: "Treat",
    collection: "THE SYSTEM",
    searchKeywords: ["refine", "pads", "texture", "pores", "tone", "treatment"],
    formulaNotes: [
      "Source formulation references exfoliating acids and sebum-balancing ingredients.",
      "Use frequency should be built gradually.",
      "Follow with hydration and daytime SPF when using exfoliating steps.",
    ],
    palettes: {
      cardDefault: {
        start: "#E7DED5",
        end: "#9A8170",
        accent: "#70483F",
        surface,
        ink,
        highlight: "#F9F3E8",
      },
      cardHover: {
        start: "#F0E7DC",
        end: "#7E6759",
        accent: "#5E3B33",
        surface,
        ink,
        highlight: "#FFF8EA",
      },
      galleryOne: {
        start: "#D8CABE",
        end: "#6F594D",
        accent: "#6C4238",
        surface,
        ink,
        highlight: "#F8F0E4",
      },
      galleryTwo: {
        start: "#ECE2D0",
        end: "#A98D79",
        accent: "#744B3F",
        surface,
        ink,
        highlight: "#FFF8ED",
      },
      detail: {
        start: "#F1E7DB",
        end: "#8C6F60",
        accent: "#69443A",
        surface,
        ink,
        highlight: "#FCF4E9",
      },
      utility: {
        start: "#E5D9CD",
        end: "#A08A7B",
        accent: "#70483F",
        surface,
        ink,
        highlight: "#FAF2E8",
      },
    },
  },
  {
    slug: "treat-03-pdrn-5-ampoule",
    displayName: "TREAT",
    formalTitle: "TREAT 03 PDRN 5% Ampoule",
    cardTagline: "Bounce and glow",
    editorialDescription:
      "A lightweight ampoule that layers hydration with a polished, resilient-looking finish.",
    editorialHowToUse:
      "Press a few drops into clean skin after toning. Use morning or night before cream.",
    productType: "Ampoule / Serum",
    routineNumber: "03",
    routineStep: "Treat",
    collection: "THE SYSTEM",
    searchKeywords: ["treat", "ampoule", "serum", "pdrn", "glow", "hydration", "recode"],
    formulaNotes: [
      "Supplier formulation highlights PDRN 5%.",
      "Lightweight serum texture for layering.",
      "Pairs with SEAL when skin needs a more complete moisture step.",
    ],
    palettes: {
      cardDefault: {
        start: "#DEE7E9",
        end: "#7C9098",
        accent: "#244B56",
        surface,
        ink,
        highlight: "#F7F2E9",
      },
      cardHover: {
        start: "#EAF0F1",
        end: "#627D87",
        accent: "#1D4450",
        surface,
        ink,
        highlight: "#FFF7EA",
      },
      galleryOne: {
        start: "#CDDDE1",
        end: "#526F78",
        accent: "#224856",
        surface,
        ink,
        highlight: "#F8F2E8",
      },
      galleryTwo: {
        start: "#E7E9DC",
        end: "#80969A",
        accent: "#34515A",
        surface,
        ink,
        highlight: "#FFF8EC",
      },
      detail: {
        start: "#EFF3F1",
        end: "#6C8790",
        accent: "#244A56",
        surface,
        ink,
        highlight: "#FDF6EA",
      },
      utility: {
        start: "#E0E8EA",
        end: "#8498A0",
        accent: "#244B56",
        surface,
        ink,
        highlight: "#FAF2E8",
      },
    },
  },
  {
    slug: "frame-04-pdrn-eye-cream",
    displayName: "FRAME",
    formalTitle: "FRAME 04 PDRN+ Eye Cream",
    cardTagline: "A more awake look",
    editorialDescription:
      "A cream-balm eye step for smoother-looking, better-rested contours.",
    editorialHowToUse:
      "Tap a small amount around the orbital area with your ring finger. Use before moisturizer.",
    productType: "Eye contour cream",
    routineNumber: "04",
    routineStep: "Eye",
    collection: "THE SYSTEM",
    searchKeywords: ["frame", "eye", "cream", "pdrn", "awake", "contour"],
    formulaNotes: [
      "Supplier formulation references PDRN+ and eye-area conditioning ingredients.",
      "Cream-balm texture made for targeted use.",
      "Use a small amount to avoid product migration near the eye.",
    ],
    palettes: {
      cardDefault: {
        start: "#E7E3DA",
        end: "#958D80",
        accent: "#4D4C45",
        surface,
        ink,
        highlight: "#F8F4EA",
      },
      cardHover: {
        start: "#F0ECE4",
        end: "#7B756B",
        accent: "#3E443D",
        surface,
        ink,
        highlight: "#FFF8EC",
      },
      galleryOne: {
        start: "#D8D4CA",
        end: "#6A665E",
        accent: "#444640",
        surface,
        ink,
        highlight: "#F9F4EA",
      },
      galleryTwo: {
        start: "#EBE5D8",
        end: "#9C9588",
        accent: "#57564E",
        surface,
        ink,
        highlight: "#FFF9EE",
      },
      detail: {
        start: "#F2EDE5",
        end: "#827B70",
        accent: "#464942",
        surface,
        ink,
        highlight: "#FCF6EA",
      },
      utility: {
        start: "#E4E0D7",
        end: "#989287",
        accent: "#4D4C45",
        surface,
        ink,
        highlight: "#FAF4EA",
      },
    },
  },
  {
    slug: "seal-05-green-collagen-cream",
    displayName: "SEAL",
    formalTitle: "SEAL 05 Green Collagen Cream",
    cardTagline: "Weightless moisture",
    editorialDescription:
      "A daily cream that seals in comfort without making the routine feel heavy.",
    editorialHowToUse:
      "Smooth over face and neck as the final moisturizer step, morning or night.",
    productType: "Cream",
    routineNumber: "05",
    routineStep: "Moisturize",
    collection: "THE SYSTEM",
    searchKeywords: ["seal", "cream", "moisturizer", "collagen", "hydration"],
    formulaNotes: [
      "Supplier formulation references green collagen and moisture-support ingredients.",
      "Daily cream texture for the final routine step.",
      "Layer over TREAT when skin wants added comfort.",
    ],
    palettes: {
      cardDefault: {
        start: "#E0E8D9",
        end: "#849878",
        accent: "#345436",
        surface,
        ink,
        highlight: "#F7F1E6",
      },
      cardHover: {
        start: "#EAF0E1",
        end: "#687F5F",
        accent: "#2A482E",
        surface,
        ink,
        highlight: "#FFF8EA",
      },
      galleryOne: {
        start: "#D0DEC7",
        end: "#536E4E",
        accent: "#304F33",
        surface,
        ink,
        highlight: "#F8F2E8",
      },
      galleryTwo: {
        start: "#EAE4D6",
        end: "#8FA17E",
        accent: "#435E3C",
        surface,
        ink,
        highlight: "#FFF7EA",
      },
      detail: {
        start: "#EDF3E6",
        end: "#718A66",
        accent: "#345436",
        surface,
        ink,
        highlight: "#FCF6EA",
      },
      utility: {
        start: "#E3EAD9",
        end: "#8DA180",
        accent: "#345436",
        surface,
        ink,
        highlight: "#FAF2E8",
      },
    },
  },
  {
    slug: "lift-06-pdrn-mask-system",
    displayName: "LIFT",
    formalTitle: "LIFT 07 PDRN Mask System",
    cardTagline: "The weekly intensive",
    editorialDescription:
      "A weekly sheet-mask intensive for a replenished, smoother-looking finish.",
    editorialHowToUse:
      "Apply to clean skin for the directed wear time, then remove and press in remaining essence.",
    productType: "Sheet mask",
    routineNumber: "07",
    routineStep: "Weekly intensive",
    collection: "INTENSIVE",
    searchKeywords: ["lift", "mask", "sheet mask", "weekly", "pdrn", "intensive"],
    formulaNotes: [
      "Supplier formulation highlights PDRN 0.5%.",
      "Weekly intensive format, separate from the daily core routine.",
      "Use source timing guidance for wear duration.",
    ],
    palettes: {
      cardDefault: {
        start: "#DFDFE8",
        end: "#747B91",
        accent: "#363A56",
        surface,
        ink,
        highlight: "#F7F1E8",
      },
      cardHover: {
        start: "#EAEBF1",
        end: "#5E657D",
        accent: "#2F344E",
        surface,
        ink,
        highlight: "#FFF7EA",
      },
      galleryOne: {
        start: "#D1D3E0",
        end: "#4D536D",
        accent: "#343955",
        surface,
        ink,
        highlight: "#F9F2E8",
      },
      galleryTwo: {
        start: "#E9E3DA",
        end: "#888EA2",
        accent: "#444963",
        surface,
        ink,
        highlight: "#FFF8EC",
      },
      detail: {
        start: "#F0F0F4",
        end: "#687087",
        accent: "#353A56",
        surface,
        ink,
        highlight: "#FCF6EA",
      },
      utility: {
        start: "#E2E3EC",
        end: "#7F869A",
        accent: "#363A56",
        surface,
        ink,
        highlight: "#FAF2E8",
      },
    },
  },
];

export function presentationMediaForProduct(
  product: MeiPellePresentationProduct,
): PresentationMedia[] {
  return [
    {
      role: "card_default",
      sortOrder: 0,
      paletteId: `${product.displayName.toLowerCase()}-card-default`,
      palette: product.palettes.cardDefault,
      alt: `${product.displayName} placeholder card surface`,
    },
    {
      role: "card_hover",
      sortOrder: 1,
      paletteId: `${product.displayName.toLowerCase()}-card-hover`,
      palette: product.palettes.cardHover,
      alt: `${product.displayName} hover placeholder surface`,
    },
    {
      role: "gallery",
      sortOrder: 2,
      paletteId: `${product.displayName.toLowerCase()}-gallery-1`,
      palette: product.palettes.galleryOne,
      alt: `${product.displayName} gallery placeholder surface one`,
    },
    {
      role: "gallery",
      sortOrder: 3,
      paletteId: `${product.displayName.toLowerCase()}-gallery-2`,
      palette: product.palettes.galleryTwo,
      alt: `${product.displayName} gallery placeholder surface two`,
    },
    {
      role: "detail",
      sortOrder: 4,
      paletteId: `${product.displayName.toLowerCase()}-detail`,
      palette: product.palettes.detail,
      alt: `${product.displayName} detail placeholder surface`,
    },
    {
      role: "cart",
      sortOrder: 5,
      paletteId: `${product.displayName.toLowerCase()}-cart`,
      palette: product.palettes.utility,
      alt: `${product.displayName} cart placeholder surface`,
    },
    {
      role: "search",
      sortOrder: 6,
      paletteId: `${product.displayName.toLowerCase()}-search`,
      palette: product.palettes.utility,
      alt: `${product.displayName} search placeholder surface`,
    },
  ];
}
