# Leaders Cosmetics USA Public Catalog Source Audit

Inspection timestamp: 2026-06-18T13:36:59Z

Scope: public catalog research for `https://www.leaderscosmeticsusa.com/collections/all-collections`. This audit used only unauthenticated public web surfaces: collection HTML, public Shopify collection JSON, product HTML, and public product JSON/JS endpoints. Reviews, ratings, testimonials, review widgets, and customer-image feeds were not imported or summarized. Image URLs below are Shopify product media URLs exposed on the product records.

## Source Surfaces

- Collection page: https://www.leaderscosmeticsusa.com/collections/all-collections
- Collection JSON: https://www.leaderscosmeticsusa.com/collections/all-collections/products.json?limit=250
- Product pages: `https://www.leaderscosmeticsusa.com/products/{handle}`
- Product JSON endpoints checked: `https://www.leaderscosmeticsusa.com/products/{handle}.json`
- Product JS endpoints checked: `https://www.leaderscosmeticsusa.com/products/{handle}.js`
- Endpoint status: collection JSON returned 85 product objects. Product `.json` and `.js` endpoints returned `200 OK` for the checked target product.

## Catalog Summary

- Products found: 85
- Collection pagination observed: 8 pages on the public collection route; `products.json?limit=250` returned all 85 products in one response.
- Public stock signal from JSON: 84 products had at least one available variant; 1 product had no available variants.
- Out-of-stock product in the JSON snapshot: Mediu Amino Moisturizing + Lifting + Clearing Mask Set - 30 Sheets (`mediu-amino-moisturizing-lifting-clearing-mask-set`).

## Full Public Catalog

| # | Product title | Handle | URL |
|---:|---|---|---|
| 1 | Leaders Aquaringer Skin Clinic Mask | `aquaringer-treatment-mask` | https://www.leaderscosmeticsusa.com/products/aquaringer-treatment-mask |
| 2 | Leaders Collagen Lifting Skin Renewal Mask | `collagen-boosting-treatment-mask` | https://www.leaderscosmeticsusa.com/products/collagen-boosting-treatment-mask |
| 3 | Leaders AC Clear Skin Clinic Mask | `ac-clear-treatment-mask` | https://www.leaderscosmeticsusa.com/products/ac-clear-treatment-mask |
| 4 | Leaders Wrinkle Tox Skin Clinic Mask | `anti-aging-treatment-mask` | https://www.leaderscosmeticsusa.com/products/anti-aging-treatment-mask |
| 5 | Leaders Vita Brightening Skin Renewal Mask | `vita-brightening-renewal-mask` | https://www.leaderscosmeticsusa.com/products/vita-brightening-renewal-mask |
| 6 | Leaders Aloe Soothing Skin Renewal Mask | `aloe-soothing-renewal-mask` | https://www.leaderscosmeticsusa.com/products/aloe-soothing-renewal-mask |
| 7 | Mediu Amino Moisture Mask | `amino-moisture-mask` | https://www.leaderscosmeticsusa.com/products/amino-moisture-mask |
| 8 | Mediu Amino Clearing Mask | `amino-clearing-ma` | https://www.leaderscosmeticsusa.com/products/amino-clearing-ma |
| 9 | Mediu Amino AC-Free Mask | `amino-ac-free-mask` | https://www.leaderscosmeticsusa.com/products/amino-ac-free-mask |
| 10 | Mediu Amino Pore-Tight Mask | `amino-pore_tight` | https://www.leaderscosmeticsusa.com/products/amino-pore_tight |
| 11 | Labotica Skin Soft Mask Rice | `labotica-rice-sheet-masks` | https://www.leaderscosmeticsusa.com/products/labotica-rice-sheet-masks |
| 12 | Labotica Skin Soft Mask Green Tea | `labotica-green-tea-sheet-masks` | https://www.leaderscosmeticsusa.com/products/labotica-green-tea-sheet-masks |
| 13 | Mediu Amino Lifting Mask | `amino-lifting-mask` | https://www.leaderscosmeticsusa.com/products/amino-lifting-mask |
| 14 | Calming Clear Milk Peel Cleanse Balm (180 ml) | `calming-clear-milk-peel-cleanse-balm` | https://www.leaderscosmeticsusa.com/products/calming-clear-milk-peel-cleanse-balm |
| 15 | Labotica Skin Soft Mask Bamboo | `labotica-bamboo-sheet-masks` | https://www.leaderscosmeticsusa.com/products/labotica-bamboo-sheet-masks |
| 16 | Leaders Tea Tree Relaxing Skin Renewal Mask | `tea-tree-relaxing-skin-renewal-mask` | https://www.leaderscosmeticsusa.com/products/tea-tree-relaxing-skin-renewal-mask |
| 17 | Leaders Insolution Collagen Lifting Skin Renewal Mask Rx | `insolution-collagen-therapy-mask` | https://www.leaderscosmeticsusa.com/products/insolution-collagen-therapy-mask |
| 18 | Ceramide Moisturizing Mask | `ceramide-moisturizing-mask` | https://www.leaderscosmeticsusa.com/products/ceramide-moisturizing-mask |
| 19 | Leaders Illuminating Skin Clinic Mask | `illuminating-skin-clinic-mask` | https://www.leaderscosmeticsusa.com/products/illuminating-skin-clinic-mask |
| 20 | Cica Calming Mask | `cica-calming-mask` | https://www.leaderscosmeticsusa.com/products/cica-calming-mask |
| 21 | ImPHYTO Retinol Mask | `im-phyto-retinol-mask` | https://www.leaderscosmeticsusa.com/products/im-phyto-retinol-mask |
| 22 | ImPHYTO Vitamin Mask | `im-phyto-vitamin-mask` | https://www.leaderscosmeticsusa.com/products/im-phyto-vitamin-mask |
| 23 | ImPHYTO Ceramide Mask | `im-phyto-ceramide-mask` | https://www.leaderscosmeticsusa.com/products/im-phyto-ceramide-mask |
| 24 | ImPHYTO Collagen Mask | `im-phyto-collagen-mask` | https://www.leaderscosmeticsusa.com/products/im-phyto-collagen-mask |
| 25 | PDRN 5% Active Ampoule | `pdrn-5-active-ampoule` | https://www.leaderscosmeticsusa.com/products/pdrn-5-active-ampoule |
| 26 | Nature Effect Tremella Mushroom Mask | `nature-effect-tremella-mushroom-mask` | https://www.leaderscosmeticsusa.com/products/nature-effect-tremella-mushroom-mask |
| 27 | ImPHYTO Mucin Mask | `im-phyto-mucin-mask` | https://www.leaderscosmeticsusa.com/products/im-phyto-mucin-mask |
| 28 | First Shot Essence Gel Mask Age Control | `first-shot-essence-gel-mask` | https://www.leaderscosmeticsusa.com/products/first-shot-essence-gel-mask |
| 29 | Pore Tightening Pad | `leaders-pore-tightening-toner-pads-50-pads-170-ml` | https://www.leaderscosmeticsusa.com/products/leaders-pore-tightening-toner-pads-50-pads-170-ml |
| 30 | Nature Effect Cica Mask | `leaders-nature_effect-cica-mask` | https://www.leaderscosmeticsusa.com/products/leaders-nature_effect-cica-mask |
| 31 | ImPHYTO AHA Mask | `im-phyto-aha-mask` | https://www.leaderscosmeticsusa.com/products/im-phyto-aha-mask |
| 32 | Leaders Collagen Enhancer Skin Renewal Mask | `leaders-collagen-enhancer-skin-clinic-mask-10-sheets` | https://www.leaderscosmeticsusa.com/products/leaders-collagen-enhancer-skin-clinic-mask-10-sheets |
| 33 | Pro Hydra Amino Sleeping Mask | `pro-hydra-amino-sleeping-mask` | https://www.leaderscosmeticsusa.com/products/pro-hydra-amino-sleeping-mask |
| 34 | Leaders Insolution Aquaringer Skin Clinic Mask | `leaders-insolution-aqua-ringer-skin-clinic-mask` | https://www.leaderscosmeticsusa.com/products/leaders-insolution-aqua-ringer-skin-clinic-mask |
| 35 | PDRN+ 2% Flat Eyebag Cream | `leaders-pdrn-2-flat-eyebag-cream` | https://www.leaderscosmeticsusa.com/products/leaders-pdrn-2-flat-eyebag-cream |
| 36 | Pro Hydra Hyaluronic Mask | `pro-hydra-hyaluronic-mask` | https://www.leaderscosmeticsusa.com/products/pro-hydra-hyaluronic-mask |
| 37 | Leaders Wrinkle-Tox Skin Clinic Mask | `leaders-wrinkle-tox-skin-clinic-mask-10-sheets` | https://www.leaderscosmeticsusa.com/products/leaders-wrinkle-tox-skin-clinic-mask-10-sheets |
| 38 | Leaders Insolution Wrinkle Tox Skin Clinic Mask | `leaders-insolution-ac-dressing-skin-clinic-mask-copy` | https://www.leaderscosmeticsusa.com/products/leaders-insolution-ac-dressing-skin-clinic-mask-copy |
| 39 | Leaders Insolution Mela-Tox Skin Clinic Mask | `leaders-insolution-mela-tox-skin-clinic-mask` | https://www.leaderscosmeticsusa.com/products/leaders-insolution-mela-tox-skin-clinic-mask |
| 40 | Nature Effect Yuja Vita Mask | `leaders-nature-effect-yuja-vita-mask` | https://www.leaderscosmeticsusa.com/products/leaders-nature-effect-yuja-vita-mask |
| 41 | Nature Effect Oat Mask | `leaders-nature-effect-oat-mask` | https://www.leaderscosmeticsusa.com/products/leaders-nature-effect-oat-mask |
| 42 | Leaders Aloe Soothing Skin Renewal Mask | `leaders-aloe-soothing-skin-clinic-mask-10-sheets` | https://www.leaderscosmeticsusa.com/products/leaders-aloe-soothing-skin-clinic-mask-10-sheets |
| 43 | Green Collagen Hydrate Boosting Cream | `green-collagen-hydrate-boosting-cream` | https://www.leaderscosmeticsusa.com/products/green-collagen-hydrate-boosting-cream |
| 44 | Calming Clear Acne Foam Cleanser | `leaders-calming-clear-acne-foam-cleanser` | https://www.leaderscosmeticsusa.com/products/leaders-calming-clear-acne-foam-cleanser |
| 45 | Leaders PDRN 0.5% Ampoule Mist | `leaders-pdrn-0-5-ampoule-mist` | https://www.leaderscosmeticsusa.com/products/leaders-pdrn-0-5-ampoule-mist |
| 46 | PDRN 0.5% Lifting Mask | `leaders-pdrn-0-5-lifting-mask` | https://www.leaderscosmeticsusa.com/products/leaders-pdrn-0-5-lifting-mask |
| 47 | Green Collagen Eye Cream For Face 30ml | `green-collagen-eye-cream-for-face` | https://www.leaderscosmeticsusa.com/products/green-collagen-eye-cream-for-face |
| 48 | Leaders Aquaringer Skin Clinic Mask | `leaders-aquaringer-skin-clinic-mask` | https://www.leaderscosmeticsusa.com/products/leaders-aquaringer-skin-clinic-mask |
| 49 | Vita Blemish Pad | `leaders-vita-blemish-pad-80-pads-x-120ml` | https://www.leaderscosmeticsusa.com/products/leaders-vita-blemish-pad-80-pads-x-120ml |
| 50 | Nature Effect Heartleaf Mask | `leaders-nature-effect-heartleaf-mask` | https://www.leaderscosmeticsusa.com/products/leaders-nature-effect-heartleaf-mask |
| 51 | Leaders Mela-Tox Skin Clinic Mask | `leaders-mela-tox-skin-clinic-mask-10-sheets` | https://www.leaderscosmeticsusa.com/products/leaders-mela-tox-skin-clinic-mask-10-sheets |
| 52 | Leaders Insolution Vita Bright Skin Renewal Mask Rx | `leaders-insolution-vita-bright-skin-renewal-mask-rx` | https://www.leaderscosmeticsusa.com/products/leaders-insolution-vita-bright-skin-renewal-mask-rx |
| 53 | 3X Boosting Modeling Mask Collagen | `3x-boosting-modeling-mask-collagen` | https://www.leaderscosmeticsusa.com/products/3x-boosting-modeling-mask-collagen |
| 54 | Leaders AC-Dressing Skin Clinic Mask | `leaders-ac-dressing-skin-clinic-mask` | https://www.leaderscosmeticsusa.com/products/leaders-ac-dressing-skin-clinic-mask |
| 55 | Green Collagen Moist Firming Serum | `green-collagen-moist-firming-serum` | https://www.leaderscosmeticsusa.com/products/green-collagen-moist-firming-serum |
| 56 | Leaders Vita Toning Skin Renewal Mask | `leaders-vita-toning-skin-clinic-mask-10-sheets` | https://www.leaderscosmeticsusa.com/products/leaders-vita-toning-skin-clinic-mask-10-sheets |
| 57 | LEADERS PDRN+ Rejuvenate Gel Mask | `leaders-pdrn-rejuvenate-gel-mask` | https://www.leaderscosmeticsusa.com/products/leaders-pdrn-rejuvenate-gel-mask |
| 58 | Nutrition Ampoule Pad | `leaders-nutrition-ampoule-pad-60-pads-x-150mlcopy-of-teatree-relaxing-toner-pads` | https://www.leaderscosmeticsusa.com/products/leaders-nutrition-ampoule-pad-60-pads-x-150mlcopy-of-teatree-relaxing-toner-pads |
| 59 | Leaders Calming Biotics Quick Soothing Pads | `leaders-calming-biotics-quick-soothing-pads-80-pads-x-170ml` | https://www.leaderscosmeticsusa.com/products/leaders-calming-biotics-quick-soothing-pads-80-pads-x-170ml |
| 60 | Green Collagen Wide Eye Patch | `green-collagen-wide-eye-patch` | https://www.leaderscosmeticsusa.com/products/green-collagen-wide-eye-patch |
| 61 | TECA Cooling Pad | `leaders-teca-cooling-pad-80-pads-x-130ml` | https://www.leaderscosmeticsusa.com/products/leaders-teca-cooling-pad-80-pads-x-130ml |
| 62 | Leaders Calming Biotics Gel Cleanser | `copy-of-leaders-calming-biotics-cream-mask-80ml` | https://www.leaderscosmeticsusa.com/products/copy-of-leaders-calming-biotics-cream-mask-80ml |
| 63 | Green Collagen Synergy Toner | `green-collagen-synergy-toner` | https://www.leaderscosmeticsusa.com/products/green-collagen-synergy-toner |
| 64 | PDRN 0.5% Essence Pad | `pdrn-0-5-essence-pad` | https://www.leaderscosmeticsusa.com/products/pdrn-0-5-essence-pad |
| 65 | Leaders Calming Biotics Essential Mask (25ml) | `leaders-calming-biotics-essential-mask-25ml` | https://www.leaderscosmeticsusa.com/products/leaders-calming-biotics-essential-mask-25ml |
| 66 | PDRN Starter Bundle | `love-at-first-glow-pdrn-set` | https://www.leaderscosmeticsusa.com/products/love-at-first-glow-pdrn-set |
| 67 | Calming Biotics Blemish Spot Cream | `calming-biotics-blemish-spot-cream` | https://www.leaderscosmeticsusa.com/products/calming-biotics-blemish-spot-cream |
| 68 | 3X Boosting Modeling Mask Vitamin | `3x-boosting-modeling-mask-vitamin` | https://www.leaderscosmeticsusa.com/products/3x-boosting-modeling-mask-vitamin |
| 69 | Leaders Calming Biotics Essence Water | `leaders-calming-biotics-essence-water-150ml` | https://www.leaderscosmeticsusa.com/products/leaders-calming-biotics-essence-water-150ml |
| 70 | Green Collagen Eye Cream For Face 50mL | `green-collagen-eye-cream-for-face-50ml` | https://www.leaderscosmeticsusa.com/products/green-collagen-eye-cream-for-face-50ml |
| 71 | Deep Moisture E.G.F. All-in-One For Man | `deep-moisture-e-g-f-all-in-one-for-man` | https://www.leaderscosmeticsusa.com/products/deep-moisture-e-g-f-all-in-one-for-man |
| 72 | Leaders Teatree Relaxing Skin Renewal Mask | `leaders-teatree-relaxing-skin-clinic-mask-10-sheets` | https://www.leaderscosmeticsusa.com/products/leaders-teatree-relaxing-skin-clinic-mask-10-sheets |
| 73 | Leaders Milk Sponge White Mud Pack to Foam | `leaders-milk-sponge-white-mud-pack-to-foam` | https://www.leaderscosmeticsusa.com/products/leaders-milk-sponge-white-mud-pack-to-foam |
| 74 | 3X Boosting Modeling Mask Teatree | `3x-boosting-modeling-mask-teatree` | https://www.leaderscosmeticsusa.com/products/3x-boosting-modeling-mask-teatree |
| 75 | Calming Face Cooler | `leaders-calming-face-cooler` | https://www.leaderscosmeticsusa.com/products/leaders-calming-face-cooler |
| 76 | PEEL STEP PHA Deep Peeling Pad | `peel-step-pha-deep-peeling-pad` | https://www.leaderscosmeticsusa.com/products/peel-step-pha-deep-peeling-pad |
| 77 | Mediu Amino Moisturizing + Lifting + Clearing Mask Set - 30 Sheets | `mediu-amino-moisturizing-lifting-clearing-mask-set` | https://www.leaderscosmeticsusa.com/products/mediu-amino-moisturizing-lifting-clearing-mask-set |
| 78 | Calming Biotics Intensive Cream | `calming-biotics-intensive-cream` | https://www.leaderscosmeticsusa.com/products/calming-biotics-intensive-cream |
| 79 | Calming Biotics Blemish Serum | `calming-biotics-ampoule-cooler-kit-copy` | https://www.leaderscosmeticsusa.com/products/calming-biotics-ampoule-cooler-kit-copy |
| 80 | Calming Biotics Blemish Cream | `calming-biotics-blemish-serum-copy` | https://www.leaderscosmeticsusa.com/products/calming-biotics-blemish-serum-copy |
| 81 | PEEL STEP Panthenol Soft Peeling Pad | `leaders-peel-step-panthenol-soft-peeling-pad` | https://www.leaderscosmeticsusa.com/products/leaders-peel-step-panthenol-soft-peeling-pad |
| 82 | PEEL STEP Cica Mild Peeling Pad | `peel-step-cica-mild-peeling-pad` | https://www.leaderscosmeticsusa.com/products/peel-step-cica-mild-peeling-pad |
| 83 | Green Collagen Balancing Emulsion | `green-collagen-balancing-emulsion` | https://www.leaderscosmeticsusa.com/products/green-collagen-balancing-emulsion |
| 84 | Autumn Collagen Repair Bundle | `autumn-collagen-kit` | https://www.leaderscosmeticsusa.com/products/autumn-collagen-kit |
| 85 | Calming Biotics Blemish Bundle | `calming-biotics-blemish-bundle` | https://www.leaderscosmeticsusa.com/products/calming-biotics-blemish-bundle |

## Target Product Details

### 1. Leaders Calming Biotics Gel Cleanser

- URL: https://www.leaderscosmeticsusa.com/products/copy-of-leaders-calming-biotics-cream-mask-80ml
- Handle: `copy-of-leaders-calming-biotics-cream-mask-80ml`
- Shopify product ID: `7248075980882`
- Product type: Gel Cleanser
- Tags: Dry Skin, Sensitive Skin, Skin Barrier
- Regular price: `$22.00`
- Compare-at price: none
- Availability: available
- Variant/public IDs: `40767571558482`, title `Default Title`, SKU not exposed, available, price `$22.00`, grams `272`
- Volume/pack count: 200 mL / 6.76 fl. oz.
- Description: Low-pH gel cleanser with a bouncy gel-to-foam texture. Positioned for gentle daily cleansing, visible redness comfort, barrier support, and non-stripping cleansing for sensitive or easily irritated skin.
- Benefits: removes impurities and excess oil without a stripped feel; supports a calmer-looking complexion; hydrates while cleansing; supports the skin barrier and microbiome; uses mild LHA exfoliation for rough texture and excess sebum.
- Directions: apply to wet hands, lather with water, massage onto damp face, rinse with lukewarm water, use morning and night as first skincare step.
- Key ingredients/technologies: multi-biotics complex, 6-type Cica complex, Centella-derived support, LHA/lipo hydroxy acid, plant-derived mucin.
- Full ingredients: not exposed as a full INCI list in the inspected public text. The product description explicitly only highlights hero concepts.
- Cautions: no explicit warning/caution text found in inspected public product text or HTML.
- SEO metadata: meta title `Leaders Calming Biotics Gel Cleanser`; canonical URL matches product URL; OG title matches product title; meta/OG description summarizes low-pH gel cleanser positioning and is derived from the product description; OG image is the first Shopify product image.
- Selection rationale: core cleanser reference for sensitive-skin, barrier-friendly merchandising and PDP structure.
- Image URLs:
  - https://cdn.shopify.com/s/files/1/0734/9573/files/cb-cleansing-gel.jpg?v=1709913115
  - https://cdn.shopify.com/s/files/1/0734/9573/files/cb-cleansing-gel5.jpg?v=1709913270
  - https://cdn.shopify.com/s/files/1/0734/9573/files/cb-cleansing-gel2.jpg?v=1709913270
  - https://cdn.shopify.com/s/files/1/0734/9573/files/cb-cleansing-gel4.jpg?v=1709913270
  - https://cdn.shopify.com/s/files/1/0734/9573/files/cb-cleansing-gel3.jpg?v=1709913270
  - https://cdn.shopify.com/s/files/1/0734/9573/files/calming-biotics-cream-mask4_b6d5c2de-5158-4fde-bdc9-d8835fe3af1a.jpg?v=1709913186
  - https://cdn.shopify.com/s/files/1/0734/9573/files/cb-cleansing-gel6.jpg?v=1709913186

### 2. Pore Tightening Pad

- URL: https://www.leaderscosmeticsusa.com/products/leaders-pore-tightening-toner-pads-50-pads-170-ml
- Handle: `leaders-pore-tightening-toner-pads-50-pads-170-ml`
- Shopify product ID: `7247314124882`
- Product type: Pad
- Tags: Anti-Acne, Combo Skin, Oily Skin
- Regular price: `$17.00`
- Compare-at price: none
- Availability: available
- Variant/public IDs: `40765424107602`, title `Default Title`, SKU `4440`, available, price `$17.00`, grams `290`
- Volume/pack count: public product details say 150 mL / 5.07 fl. oz. / 50 pads. The handle includes `170-ml`, so the public data has a volume inconsistency.
- Description: Daily toner pad for pore appearance, uneven texture, excess oil, and residue removal. Positioned as a non-stripping prep step after cleansing.
- Benefits: pore-refining appearance care; texture smoothing; oil balancing; lightweight hydration; suited to oily, combination, pore-prone, shiny, or congested-looking skin.
- Directions: after cleansing, sweep a pad over face with focus on T-zone or visible-pore areas; for targeted care, leave pads on nose, cheeks, or T-zone for 3-5 minutes; follow with serum and moisturizer; use SPF in daytime.
- Key ingredients/technologies: Korea-patented pore care complex, dual-sided pad, peppermint extract, collagen, Palmitoyl Tripeptide-5, sodium hyaluronate, panthenol, seaweed extracts.
- Full ingredients: Water (Aqua), Betaine, 1,2-Hexanediol, Panthenol, Butylene Glycol, Ethylhexylglycerin, Caprylyl Glycol, Adenosine, Disodium EDTA, Sodium Hyaluronate, Prunus Salicina Fruit Extract, Ecklonia Cava Extract, Laminaria Japonica Extract, Glycerin, Mentha Piperita (Peppermint) Extract, Collagen, Palmitoyl Tripeptide-5.
- Cautions: no explicit warning/caution text found in inspected public product text or HTML.
- SEO metadata: meta title `Pore Tightening Pad`; canonical URL matches product URL; OG title matches product title; meta/OG description summarizes daily pore-refining toner pad positioning; OG image is the first Shopify product image.
- Selection rationale: pad-format benchmark for variant copy, quantity messaging, and treatment-pad PDP details.
- Image URLs:
  - https://cdn.shopify.com/s/files/1/0734/9573/files/po01.jpg?v=1775503521
  - https://cdn.shopify.com/s/files/1/0734/9573/files/po1.png?v=1775503987
  - https://cdn.shopify.com/s/files/1/0734/9573/files/po2.png?v=1775504046
  - https://cdn.shopify.com/s/files/1/0734/9573/files/po4.png?v=1775504046
  - https://cdn.shopify.com/s/files/1/0734/9573/files/po3.png?v=1775504046
  - https://cdn.shopify.com/s/files/1/0734/9573/files/vita2_01.jpg?v=1775505627
  - https://cdn.shopify.com/s/files/1/0734/9573/files/po_02_b5a9536f-2ab3-4666-b0c6-17c4449fcfd5.jpg?v=1775505627
  - https://cdn.shopify.com/s/files/1/0734/9573/files/po6.jpg?v=1775505627
  - https://cdn.shopify.com/s/files/1/0734/9573/files/po8.jpg?v=1775505627
  - https://cdn.shopify.com/s/files/1/0734/9573/files/po5.png?v=1775505627
  - https://cdn.shopify.com/s/files/1/0734/9573/files/po7.png?v=1775505627
  - https://cdn.shopify.com/s/files/1/0734/9573/files/po8.png?v=1775505627

### 3. PDRN 5% Active Ampoule

- URL: https://www.leaderscosmeticsusa.com/products/pdrn-5-active-ampoule
- Handle: `pdrn-5-active-ampoule`
- Shopify product ID: `7465003057234`
- Product type: not set in JSON
- Tags: none
- Regular price: `$25.00`
- Compare-at price: none
- Availability: available
- Variant/public IDs: `42072641208402`, title `Default Title`, SKU `8809672285263`, available, price `$25.00`, grams `154`
- Volume/pack count: 30 mL / 1.01 fl. oz.
- Description: Lightweight daily ampoule positioned around PDRN, radiance, hydration, texture refinement, and comfortable AM/PM layering.
- Benefits: supports radiance; smooths the look of texture; hydrates without a heavy feel; supports refined healthy-looking skin with consistent use; suitable as a fast-absorbing conditioning step.
- Directions: after cleansing and toner/essence, apply 2-3 drops, press into skin for 30-60 seconds, follow with moisturizer, use SPF in daytime, use morning and night.
- Key ingredients/technologies: Sodium DNA/PDRN 50,000 ppm, niacinamide, trehalose and humectant base, peptide complex, adenosine.
- Full ingredients: Water, Dipropylene Glycol, Butylene Glycol, Glycerin, Propanediol, Sodium DNA (50,000 ppm), 1,2-Hexanediol, Niacinamide, Trehalose, Polyglyceryl-10 Laurate, Xanthan Gum, Allantoin, Caprylyl Glycol, Ethylhexylglycerin, Adenosine, Disodium EDTA, Copper Tripeptide-1, Tripeptide-1, Palmitoyl Tripeptide-1, Palmitoyl Pentapeptide-4, Hexapeptide-11, Hexapeptide-9.
- Cautions: no explicit warning/caution text found in inspected public product text or HTML.
- SEO metadata: meta title `PDRN 5% Active Ampoule`; canonical URL matches product URL; OG title matches product title; meta/OG description summarizes high-performance PDRN ampoule care for radiance and texture; OG image is the first Shopify product image.
- Selection rationale: prestige serum/ampoule reference and PDRN-positioned treatment product for copy and product-data modeling.
- Image URLs:
  - https://cdn.shopify.com/s/files/1/0734/9573/files/essencem2.png?v=1773191849
  - https://cdn.shopify.com/s/files/1/0734/9573/files/T01.png?v=1773191849
  - https://cdn.shopify.com/s/files/1/0734/9573/files/T03.png?v=1773191849
  - https://cdn.shopify.com/s/files/1/0734/9573/files/T02.png?v=1773191849
  - https://cdn.shopify.com/s/files/1/0734/9573/files/t04.png?v=1773191849
  - https://cdn.shopify.com/s/files/1/0734/9573/files/4_0a9fd241-9cbc-43e4-b51f-e958f3645dec.jpg?v=1773191849
  - https://cdn.shopify.com/s/files/1/0734/9573/files/t05.png?v=1773191849

### 4. PDRN+ 2% Flat Eyebag Cream

- URL: https://www.leaderscosmeticsusa.com/products/leaders-pdrn-2-flat-eyebag-cream
- Handle: `leaders-pdrn-2-flat-eyebag-cream`
- Shopify product ID: `7524442603602`
- Product type: not set in JSON
- Tags: none
- Regular price: `$29.00`
- Compare-at price: none
- Availability: available
- Variant/public IDs: `42282524409938`, title `Default Title`, SKU not exposed, available, price `$29.00`, grams `0`
- Volume/pack count: 20 mL / 0.67 fl. oz.
- Description: Eye-area cream-balm positioned for under-eye puffiness appearance, smoothness, brightness, hydration, and contour definition.
- Benefits: reduces the look of puffiness; smooths the look of fine lines and uneven texture; supports a firmer-looking eye contour; brightens the look of the under-eye area; refreshed, rested appearance.
- Directions: after serum or moisturizer, apply a small amount under eyes, tap along orbital bone with ring finger, allow to absorb, use morning and night.
- Key ingredients/technologies: Sodium DNA/PDRN, Acmella Oleracea Extract, Acetyl Tetrapeptide-5, niacinamide, panthenol, adenosine, peptides, glutathione, Guaiazulene.
- Full ingredients: Water, Magnesium Aluminum Silicate, 1,2-Hexanediol, Sodium DNA, Niacinamide, Sodium Silicate, Butylene Glycol, Sodium Citrate, Citric Acid, Panthenol, Allantoin, Hydroxyethylcellulose, Xanthan Gum, Disodium EDTA, Ethylhexylglycerin, Tribulus Terrestris Fruit Extract, Caprylyl Glycol, Acmella Oleracea Extract, Magnolia Officinalis Bark Extract, Adenosine, Hydrolyzed Sponge, Acetyl Tetrapeptide-5, Dipropylene Glycol, Guaiazulene, Acetyl Hexapeptide-8, Glutathione, Copper Tripeptide-1, Palmitoyl Pentapeptide-4.
- Cautions: no explicit warning/caution text found in inspected public product text or HTML.
- SEO metadata: meta title `PDRN+ 2% Flat Eyebag Cream`; canonical URL matches product URL; OG title matches product title; meta/OG description summarizes high-performance eye care for smoother, brighter-looking eyes; OG image is the first Shopify product image.
- Selection rationale: targeted eye treatment reference for small-volume treatment PDP and concern-specific merchandising.
- Image URLs:
  - https://cdn.shopify.com/s/files/1/0734/9573/files/eyebag_87b70b0a-670d-42a4-93ec-f26450a01c86.png?v=1773431575
  - https://cdn.shopify.com/s/files/1/0734/9573/files/eyebag1.png?v=1773431575
  - https://cdn.shopify.com/s/files/1/0734/9573/files/pdrningre.jpg?v=1773457134
  - https://cdn.shopify.com/s/files/1/0734/9573/files/eyebag2.png?v=1773457134
  - https://cdn.shopify.com/s/files/1/0734/9573/files/eyebag3.png?v=1773457134
  - https://cdn.shopify.com/s/files/1/0734/9573/files/eyebag4_e081513e-a61f-43b0-a58a-2431bda7acfd.png?v=1773457134
  - https://cdn.shopify.com/s/files/1/0734/9573/files/eyebag5.png?v=1773457134
  - https://cdn.shopify.com/s/files/1/0734/9573/files/EyebagVolumeLifting_visiblysmoothsandflattensuponapplication_2.png?v=1773457134
  - https://cdn.shopify.com/s/files/1/0734/9573/files/EyebagVolumeLifting_visiblysmoothsandflattensuponapplication_4.png?v=1773457134
  - https://cdn.shopify.com/s/files/1/0734/9573/files/eyebag6.png?v=1773457134

### 5. Green Collagen Hydrate Boosting Cream

- URL: https://www.leaderscosmeticsusa.com/products/green-collagen-hydrate-boosting-cream
- Handle: `green-collagen-hydrate-boosting-cream`
- Shopify product ID: `7132643098706`
- Product type: Cream
- Tags: Anti-Aging, Dry Skin, New, Normal Skin, Skin Barrier, Vegan
- Regular price: `$26.00`
- Compare-at price: none
- Availability: available
- Variant/public IDs: `40465103650898`, title `Default Title`, SKU `3986`, available, price `$26.00`, grams `200`
- Volume/pack count: 50 mL / 1.69 fl. oz.
- Description: Daily hydrating collagen cream positioned for moisture balance, soft texture, radiance, and a nourishing but non-heavy finish.
- Benefits: daily hydration support; smoother-looking texture; more radiant appearance with consistent layering; comfort-focused cream feel; balanced AM/PM finish.
- Directions: cleanse, apply toner or essence, apply an appropriate amount to face and neck, use SPF in daytime.
- Key ingredients/technologies: green collagen complex, sodium hyaluronate, panthenol, niacinamide.
- Full ingredients: not exposed as a full text INCI list in the inspected public product description or page HTML.
- Cautions: no explicit warning/caution text found in inspected public product text or HTML.
- SEO metadata: meta title `Leaders Insolution Green Collagen Hydrate Boosting Cream`; canonical URL matches product URL; OG title uses the longer `Leaders Insolution...` title; meta/OG description is a longer vegan collagen cream description mentioning dermatologist-created Korean skincare and plant-based ingredients; OG image is the first Shopify product image.
- Selection rationale: moisturizer/cream benchmark for hydration, vegan collagen positioning, and older product metadata patterns.
- Image URLs:
  - https://cdn.shopify.com/s/files/1/0734/9573/files/Cream_1.jpg?v=1689027789
  - https://cdn.shopify.com/s/files/1/0734/9573/files/Green_Collagen_Cream_Lifestyle_1.jpg?v=1714680426
  - https://cdn.shopify.com/s/files/1/0734/9573/files/Green_Collagen_Back.jpg?v=1689027789
  - https://cdn.shopify.com/s/files/1/0734/9573/files/Green_Collagen_Box_Front.jpg?v=1689027789
  - https://cdn.shopify.com/s/files/1/0734/9573/files/Green_Collagen_Cream_Box_Back.jpg?v=1689027789
  - https://cdn.shopify.com/s/files/1/0734/9573/files/green_collagen_cream_box_side.jpg?v=1726100666
  - https://cdn.shopify.com/s/files/1/0734/9573/files/Green_Collagen_Cream_Lifestyle_2.jpg?v=1714680426

### 6. PDRN 0.5% Lifting Mask

- URL: https://www.leaderscosmeticsusa.com/products/leaders-pdrn-0-5-lifting-mask
- Handle: `leaders-pdrn-0-5-lifting-mask`
- Shopify product ID: `7512596250706`
- Product type: spe
- Tags: none
- Regular price: `$40.00`
- Compare-at price: none
- Availability: available
- Variant/public IDs: `42243741057106`, title `10 Mask Pack`, SKU not exposed, available, price `$40.00`, grams `381`
- Volume/pack count: 10 masks x 25 mL / 0.84 fl. oz. each
- Description: Contour-hugging sheet mask positioned for plumper, smoother, more refined-looking skin with hydration, elasticity appearance care, and a lifted-look finish.
- Benefits: bouncier-looking elasticity; plumper hydrated look; reduced look of fine dry lines; contour-hugging fit for a refined lifted look; radiant, smoother, makeup-ready finish.
- Directions: place mask on cleansed skin and contour around eyes, nose, and mouth; leave 10-20 minutes; remove and tap remaining serum into skin.
- Key ingredients/technologies: Sodium DNA/PDRN 5,000 ppm, niacinamide, bamboo cellulose sheet, 7-molecular weight collagen, adenosine, allantoin.
- Full ingredients: Water, Butylene Glycol, Methylpropanediol, Glycerin, Niacinamide, Hydroxyethyl Acrylate/Sodium Acryloyldimethyl Taurate Copolymer, Sodium DNA (5,000 ppm), Ethylhexylglycerin, Caprylyl Glycol, Allantoin, Xanthan Gum, Sorbitan Isostearate, Adenosine, Disodium EDTA, Hydrolyzed Collagen.
- Cautions: no explicit warning/caution text found in inspected public product text or HTML.
- SEO metadata: meta title `PDRN 0.5% Lifting Mask`; canonical URL matches product URL; OG title matches product title; meta/OG description summarizes a lifting-look sheet mask for bouncier, smoother-looking skin; OG image is the first Shopify product image.
- Selection rationale: sheet-mask pack reference for pack-count variant, concern-led copy, and reusable mask PDP structure.
- Image URLs:
  - https://cdn.shopify.com/s/files/1/0734/9573/files/mask_3d212f68-f06e-4f9a-b390-ba10a58066bd.png?v=1773191744
  - https://cdn.shopify.com/s/files/1/0734/9573/files/mask1.png?v=1773191744
  - https://cdn.shopify.com/s/files/1/0734/9573/files/mask2.png?v=1773191744
  - https://cdn.shopify.com/s/files/1/0734/9573/files/mask5.png?v=1773191744
  - https://cdn.shopify.com/s/files/1/0734/9573/files/mask5_f157c6dd-d93f-418a-ae4c-8ec68b58fe9d.jpg?v=1773195853
  - https://cdn.shopify.com/s/files/1/0734/9573/files/04_aa084924-fc2e-4fc6-b351-d76b97e39b85.png?v=1773195853
  - https://cdn.shopify.com/s/files/1/0734/9573/files/PDRNLine_1.png?v=1773195853
  - https://cdn.shopify.com/s/files/1/0734/9573/files/product_image_1.png?v=1773195853
  - https://cdn.shopify.com/s/files/1/0734/9573/files/mask6.jpg?v=1773195853

## Notes For Mei-Pelle

- This is reference research only. Do not copy Leaders brand names, exact claims, imagery, or trade dress into Mei-Pelle.
- Useful patterns to borrow at the feature level: collection pagination, product cards, product detail sections, variants, price/availability display, ingredient accordions, image gallery, and cart-ready variant IDs.
- Avoid importing review ratings, testimonials, customer photos, or app-generated social proof.
- The public source has some data-quality wrinkles worth modeling defensively: stale handles, missing SKUs, product types left blank, one volume discrepancy, and product description HTML containing embedded CSS.
