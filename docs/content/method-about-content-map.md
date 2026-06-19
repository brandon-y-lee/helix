# Method / About Content Map

Date: 2026-06-19

Research document status: the requested files `08_barrier_spf_acne.md`, `09_actives_advanced_ingredients.md` / `09_actives_advanced_ingredients(1).md`, and `12_crowding_whitespace.md` were not found under the repository, Desktop project-local paths, or Codex attachments. The implementation uses the research brief embedded in the user request.

## Claim Matrix

| Page | Section | Product | Claim | Source | Type | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| Method | 01 RESET step | RESET | Cleansing removes oil, sweat, sunscreen, and surface buildup. | User brief + product `howToUse` / cleanser role | general educational statement | low |
| Method | 02 REFINE step | REFINE | Texture-control products should be introduced with frequency restraint through canonical directions, not a bold warning block. | User brief + product `editorialHowToUse` | general educational statement / catalog fact | low |
| Method | REFINE step | REFINE | Refines the look of pores / texture without promising pore shrinkage. | Product `benefits`; copy constrained to appearance language | supplier/catalog fact | review |
| Method | 03 RECODE step | RECODE | PDRN is described through topical cosmetic context and formula role only. | User brief + product `keyIngredients` / `ingredients` | general educational statement / catalog fact | review |
| Method | 03 RECODE step | RECODE | The former defensive `ADVANCED DOES NOT MEAN AGGRESSIVE` callout was removed. | User brief revision | claim-safety decision | low |
| Method | 04 FRAME step | FRAME | Eye-area care supports a smoother, more rested-looking presentation. | Product `benefits`; user eye-area guardrails | supplier/catalog fact | review |
| Method | FRAME step | FRAME | No permanent eye-bag, fat-pad, muscle, or orbital remodeling claim. | User brief guardrails | claim-safety decision | low |
| Method | 05 SEAL step | SEAL | Moisturizer is the final moisturizing layer before SPF in the morning or final layer at night. | User brief + product `howToUse` | general educational statement / catalog fact | low |
| Method | SEAL step | SEAL | Humectants and barrier-supportive ingredients support comfort and water retention. | User brief | general educational statement | low |
| Method | 06 PROTECT | None | Broad-spectrum SPF 30+ is the final AM step. | User brief | general educational statement | low |
| Method | 06 PROTECT | None | PROTECT is coming soon, not a Supabase product, not indexed in Algolia, not purchasable, and has no PDP/variant/price/inventory. | Active catalog state; no SPF product slug rendered | catalog fact / implementation guardrail | low |
| Method | 06 PROTECT | None | Future sunscreen formulation education names formulation variables, but does not claim specific UV filters, tint, niacinamide, peptides, or SPF rating beyond general SPF 30 guidance. | User brief guardrails | claim-safety decision | low |
| Method | 07 LIFT step | LIFT | Weekly sheet-mask intensive, not a daily step. | Product `usageTime` / `routineStep`; user brief | catalog fact / editorial framing | low |
| Method | Ingredient Literacy | RECODE / FRAME / LIFT | Peptides are framed as sequence- and formulation-specific cosmetic ingredients. | Product `keyIngredients` / `ingredients`; user brief | catalog fact / claim-safety decision | review |
| Method | Ingredient Literacy | RECODE / FRAME / LIFT | PDRN customer-facing language avoids DNA repair, tissue regeneration, wound healing, angiogenesis, cell proliferation, and medical rejuvenation promises. | User brief guardrails | claim-safety decision | low |
| Method | Ingredient Literacy | REFINE / SEAL | Collagen-source ingredients are not described as rebuilding dermal collagen. | Product `keyIngredients` / `ingredients`; user brief | claim-safety decision | low |
| Method | Ingredient Literacy | REFINE | Exfoliating acids are described through acid type, pH, vehicle, and use frequency without acne-treatment claims. | Product key ingredient LHA + user brief | catalog fact / general education | low |
| About | Hero / opening | None | South Korean formulation discipline and Los Angeles self-invention are creative influences. | User brief | brand narrative | review |
| About | Cultural split | None | Seoul / Los Angeles are framed as influences, not universal cultural facts. | User brief guardrails | claim-safety decision | low |
| About | Why men | None | Men deserve sophisticated skincare without confusion. | User brief | brand narrative | low |
| About | Quality | None | Mei-Pelle pursues high-specification, purposeful ingredients selected for function and compatibility. | User brief | brand aspiration | review |
| About | Sustainability | None | Sustainability is an operating discipline to measure, document, and improve. | User brief | brand aspiration | review |

## Explicit Guardrails

- Sequence: 01 RESET, 02 REFINE, 03 RECODE, 04 FRAME, 05 SEAL, 06 PROTECT, 07 LIFT.
- PROTECT: coming-soon editorial Method step only. No fabricated SPF product, slug, variant, price, inventory, PDP, cart action, or Algolia record.
- LIFT: presentation metadata is 07 while the stable product slug remains `lift-06-pdrn-mask-system`.
- Ingredient cards: use scientific fields (`INCI / IDENTITY`, `CLASS`, `MECHANISM`, `SKIN RELEVANCE`, `FOUND IN`, optional `FORMULATION NOTE`) and no repeated fine-print footer.
- REFINE / RECODE: bold defensive callout blocks were removed; practical direction stays in normal copy.
- PDRN: no regeneration, DNA repair, wound healing, stem-cell, or permanent structural-change claims.
- Peptides: no guaranteed collagen-production claims.
- Barrier: comfort, support, and consistency language only; no eczema or medical healing claims.
- Pores: appearance and texture language only; no permanent pore-closing claim.
- Collagen: no topical collagen rebuilding dermal collagen claim.
- Eye area: rested-looking and smoother-looking language only; no anatomical remodeling.
- SPF: broad-spectrum SPF education only; no fake Mei-Pelle SPF, no all-day protection, no reef-safety claims.
- Sustainability: no carbon-neutral, zero-waste, recyclable, vegan, cruelty-free, plastic-free, biodegradable, or sustainably sourced claims without documentation.
- Korean culture: influences and design principles only; no stereotypes, exoticizing, manufacturing-origin claims, or founder biography.
- Ingredient quality: pursuit/standard language only; no medical grade, clinical proof, dermatologist-developed, pharmaceutical grade, hypoallergenic, non-toxic, or safe-for-everyone claims.
