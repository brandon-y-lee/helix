// User-approved formulation concept copy for the staging design.
// Product identity is stable across catalog slug and display-name changes.
export const SERUM_EFFECTS_PRODUCT_ID = "f6091deb-1177-45ad-b506-1f0427fa4abe";

export const effects = [
  {
    "id": "hydration",
    "title": "Hydration",
    "promise": "A deeper sense of hydration.",
    "summary": "Water-binding ingredients and stress-protection support, brought together for skin that feels comfortably hydrated.",
    "pathways": [
      {
        "title": "Water binding",
        "ingredients": "Glycerin · Hyaluronic acid · Betaine",
        "description": "Humectants attract and hold water, supporting a softer, more supple skin feel."
      },
      {
        "title": "Stress protection",
        "ingredients": "Ectoin",
        "description": "An osmolyte selected to complement hydration and help skin cope with environmental stress."
      }
    ]
  },
  {
    "id": "barrier",
    "title": "Barrier protection",
    "promise": "Comfort starts at the barrier.",
    "summary": "A coordinated approach to barrier lipids, environmental stress, and skin comfort.",
    "pathways": [
      {
        "title": "Lipid restoration",
        "ingredients": "Ceramides · Cholesterol · Fatty acids",
        "description": "A complementary lipid system intended to replenish the components that help limit moisture loss."
      },
      {
        "title": "Stress protection",
        "ingredients": "Ectoin",
        "description": "Complements the lipid system with hydration and environmental-stress support."
      },
      {
        "title": "Soothing & tolerance",
        "ingredients": "Panthenol · Allantoin · Madecassoside",
        "description": "Selected to support a calm, comfortable skin feel alongside the active ingredients."
      }
    ]
  },
  {
    "id": "clarity",
    "title": "Brightening & clarity",
    "promise": "A clearer, more even-looking tone.",
    "summary": "Tone, renewal, and antioxidant pathways converge on the appearance of clarity.",
    "pathways": [
      {
        "title": "Pigment-pathway support",
        "ingredients": "Niacinamide · N-acetyl glucosamine",
        "description": "A proposed pairing to support a more even-looking tone. N-acetyl glucosamine is also known as NAG."
      },
      {
        "title": "Cellular renewal",
        "ingredients": "Retinal or Retinol — selection pending",
        "description": "A retinoid pathway for smoother-looking texture. Final ingredient and concentration remain open."
      },
      {
        "title": "Oxidative-stress defense",
        "ingredients": "Acetyl zingerone · Tocopherol",
        "description": "An antioxidant pairing intended to complement tone and renewal pathways."
      }
    ]
  },
  {
    "id": "firmness",
    "title": "Anti-aging & firmness",
    "promise": "Smoother texture. A firmer look.",
    "summary": "Renewal, antioxidant support, and a targeted peptide system for the appearance of firmer skin.",
    "pathways": [
      {
        "title": "Cellular renewal",
        "ingredients": "Retinal or Retinol — selection pending",
        "description": "A retinoid pathway for the appearance of fine lines and texture. Final selection remains open."
      },
      {
        "title": "Oxidative-stress defense",
        "ingredients": "Acetyl zingerone · Tocopherol",
        "description": "Antioxidant support complements the proposed renewal and firmness pathways."
      },
      {
        "title": "Matrix & firmness signaling",
        "ingredients": "Specified peptides — selection pending",
        "description": "The peptide identities and supporting evidence must be defined before making finished-formula claims."
      }
    ]
  }
];

export type Effect = (typeof effects)[number];
