# Tertiary and DTC packaging supplier and system scan

**Decision status:** sourcing-ready planning evidence; not a supplier award, production approval, or environmental claim authorization

**Research date:** 2026-08-31

**Commercial boundary:** public evidence only; no supplier contact, private quote, sample order, carrier contract, or laboratory engagement

**Planning quantity:** 1,000, 2,000, or 3,000 primary containers per Product, split between Mini and Full Product Variants; tertiary and DTC quantities are derived quantities, not automatically 1,000–3,000 units

**Delivery boundary:** accepted finished goods and replenishment packaging at a named Southern California receiving dock, followed by a separate order-level P4 DTC view

**Related work:** [size and supply-chain benchmarks](./cleanser-packaging-size-supply-chain-benchmark.md), [serum benchmark](./serum-packaging-size-supply-chain-benchmark.md), [moisturizer benchmark](./moisturizer-packaging-size-supply-chain-benchmark.md), [landed-cost evidence model](./packaging-landed-cost-evidence-model.md), [quality and compatibility gates](./packaging-quality-compatibility-supplier-gates.md), [sustainability scoring](./packaging-sustainability-scoring.md), [U.S./California constraints](./us-california-cosmetic-packaging-constraints.md), and [packaging/filling route comparison](./packaging-to-odm-domestic-filler-route-comparison.md)

**Issue:** [#261](https://github.com/brandon-y-lee/helix/issues/261)

## Decision in one page

No supplier or system can yet be called the cheapest high-quality option. Public pages do not provide comparable delivered quotes for one exact case, insert, pallet, DTC order profile, and Southern California ZIP; no exact filled Helix configuration has passed a route-appropriate distribution sequence. A visible unit price, recycled-content statement, customer logo, or generic transit-test claim cannot replace those missing facts.

The evidence does support a disciplined sourcing sequence:

1. **Use a local, one-way corrugated system as the launch cost-control baseline [SI].** Quote a plain or one-color right-sized RSC/master case, corrugated or molded-fiber cells, top/bottom pads where required, and manual load containment from at least three Southern California suppliers. Ecko, Acorn/McKinley, PCA Los Angeles, Crown Riverside, and Ernest are the strongest public local leads. Uline Ontario provides a transparent stock control, not an engineered-pack substitute.
2. **Run a separate right-sized DTC RFQ [SI].** Compare EcoEnclose, Fantastapack, one Digital Room storefront, and Arka on the same outer dimensions, board, print, insert, quantities, delivery ZIP, and calendar. A mailer without a validated restraint is not an acceptable glass shipper.
3. **Prototype three protection tracks for glass [SI].** Compare a die-cut corrugated/molded-fiber restraint, paper cushioning from Ranpak or Pregis, and Sealed Air Korrvu suspension/retention. Foam-in-place is a damage-control exception, not the default, because recovery, material, equipment, and unboxing tradeoffs remain unresolved.
4. **Use exact-route tests before optimizing material away [VF/SI].** ISTA 3A is the primary DTC parcel protocol; ISTA 3B applies to mixed LTL; ISTA 3E applies to similar-product unit loads in full-truckload manufacturer-to-DC service. ASTM D7386 is another single-parcel sequence. Compression, vibration, drop, conditioning, and rough-handling methods are components of a release plan, not standalone proof that the whole configuration passes.
5. **Treat palletization as a designed unit load [SI].** Quote a standard 48 × 40-inch, zero-overhang pattern, case-level top load, tier sheets, corner/edge protection, film mass and containment force. Compare expendable heat-treated pallets with CHEP pooling only after every receiver and recovery leg is known. Signode is the load-containment/test challenger; a wrapper is not justified until pallet throughput and labor support it.
6. **Keep reusable DTC shipping as a measured pilot, not the launch baseline [SI].** BOOX is the strongest U.S. operator lead and its Rhode relationship is freshly verified at the DTC-shipper level. Public evidence does not disclose a current achieved return/loss distribution, cleaning SOP, Southern California refurbishment node, or complete per-service price. A design-life claim is not an achieved-use count.

The first award decision should occur only after common E3 offers, production-equivalent samples, exact filled-pack testing, and P3/P4 cost normalization. Sustainability remains a weighted objective after safety, legality, compatibility, traceability, and transport gates pass.

## Evidence grammar and decision rules

Every material conclusion uses one of five labels:

| Label | Meaning | Permitted use |
|---|---|---|
| **[VF] Verified fact** | Regulator, standards owner, carrier tariff/rule, or another authoritative public record | May define a gate or calculation; applicability and effective date still matter |
| **[SA] Supplier assertion** | A supplier-, operator-, or brand-authored statement, specification, location, case study, price, certificate claim, or customer relationship | May create a lead and an RFQ field; not independent proof of performance |
| **[SI] Supported inference** | A transparent conclusion drawn from cited facts and the established cost/quality models | May sequence work or define a sensitivity; not a quote or qualification result |
| **[L] Lead** | A credible candidate with enough first-party evidence to include in an RFQ, prototype, or control set | Must close its named unknowns before ranking |
| **[U] Unknown** | A decision-critical value absent from inspected public evidence | Remains blank, fails a gate, or becomes an RFQ request; never enters a model as zero |

Supplier-authored public pricing is **E1** under the [landed-cost evidence model](./packaging-landed-cost-evidence-model.md). Even an exact E1 price is not comparable unless geometry, board, print, quantity, incoterm, freight, tax/duty, tolerances, packout, and time basis match. A commercial ranking requires at least common E3 offers and passed hard gates. First-run cash and consumed economics remain separate.

This report uses “manufacturer” only where the first-party page identifies production at a site. “Supplier,” “storefront,” “integrator,” “distributor,” “operator,” and “pooler” are not interchangeable. When the actual converter, material mill, subcontractor, or refurbishment site is unpublished, it is **[U]** even if the seller has a local office.

## Planning envelope carried into this decision

Exact external primary dimensions, retail-carton dimensions, decorated weights, Formula density, filled weights, and centers of gravity are not approved. Therefore this report does **not** select case counts, shipper dimensions, board grade, pallet height, or a final divider. It carries the current provisional Variant plan only:

| Product | Mini planning fill | Full planning fill | Retained scenarios | Tertiary/DTC consequence |
|---|---:|---:|---|---|
| Cleanser | 30 mL | 120 mL | 40, 100, and 150 mL | Flexible tube is not shatter-prone, but cap, shoulder, tail seal, puncture, abrasion, leakage, and permanent crushing remain transport hazards |
| Serum | 10 mL target; 15 mL stock fallback | 30 mL target; 50 mL high-dose fallback | Stock round bottle remains the cost-control geometry | Frosted glass, pipette, bulb/collar, closure torque, leakage, abrasion, glass escape, and glass-to-glass contact drive restraint design |
| Moisturizer | 15 g declared; sample 15/20 mL glass | 50 g declared; sample 50/60/75 mL glass | 60 g contingency | Wide-mouth glass is heavy for its fill, vulnerable to closure movement and shatter, and may make cases weight-limited before cube-limited |

The Mini and Full configurations are six separate release objects. A pass for one size does not approve the other; a stock bottle or jar with different mass, finish, closure, pipette, or carton does not inherit a result.

The primary-container MOQ does not equal the tertiary requirement:

```text
master cases required = ceil(accepted finished units / accepted units per master case)

DTC shippers required
  = forecast fulfilled orders
  = forecast shipped units / observed average units per order

reserve packaging
  = validated damage/rework/sample allowance
    + supplier overrun/underrun exposure
    + service-level safety stock
```

**[SI]** A 3,000-unit Product run may require far fewer than 3,000 DTC shippers because orders can contain multiple Products; conversely, a two-size split and several basket formats can create multiple low-volume shipper and insert SKUs. All outer-pack MOQs must therefore be evaluated against orders and case packs, not the primary-container count.

## Required system architecture and every logistics leg

### Upstream finished-goods route: overseas ODM/filler

```text
corrugated/insert/pallet suppliers
  → packaging consolidation or direct delivery to ODM/filler
  → incoming inspection / quarantine / dry storage
  → filled and decorated Mini/Full unit release
  → retail carton, if selected
  → same-SKU master-case packout / dividers / pads / tape / labels
  → pallet pattern / tier sheets / corner protection / stretch containment
  → origin pickup / export terminal / port or airport
  → international main carriage
  → U.S. import terminal / broker / examination if any
  → drayage or domestic linehaul
  → named Southern California receiver
  → unload / appointment / pallet exchange / count / inspection / acceptance
  → storage / replenishment pick face
```

### Upstream finished-goods route: domestic filler

```text
domestic or imported empty primary/secondary components
  → domestic filler receipt / quarantine
bulk Formula route
  → domestic filler receipt / quarantine / transfer
local or regional master-case supplier
  → filler pack line
filled Mini/Full assembly and release
  → master case / pallet / containment
  → domestic freight to Southern California 3PL
  → receiving / inspection / acceptance / storage
```

### One-way DTC route

```text
shipper + insert + paper protection + tape/label suppliers
  → Southern California 3PL receiving / inspection / storage
  → order allocation / pick
  → pack / seal / label / scan / exception handling
  → parcel-carrier origin induction
  → sort hubs / linehaul / destination station
  → last-mile delivery
  → consumer opening / disposal or ordinary merchandise return
  → damage claim / replacement / reshipment when required
```

### Reusable DTC route

```text
durable shipper manufacture
  → operator or 3PL inventory
  → pack / outbound parcel / consumer
  → QR or label activation
  → mailbox, return point, or pickup
  → reverse carrier / consolidation
  → operator receipt / dwell / inspection
  → cleaning / drying / sanitation / repair or rejection
  → storage / brand-dedicated or pooled recirculation
  → replenishment to 3PL
  → end-of-life recycler and documented yield
```

Each arrow needs an owner, named origin/destination, service/mode, timing, quantity basis, Incoterm where relevant, charge, loss/damage rule, and evidence date. Empty corrugated and assembled inserts are cube-heavy; **[SI]** sourcing near the pack line can reduce an inbound empty-volume leg, but only a common delivered quote can show whether that outweighs a lower remote component price.

## Product-specific protection briefs

| Release object | Master-case restraint hypothesis **[SI]** | DTC hypothesis **[SI]** | Predefined failure observations |
|---|---|---|---|
| Cleanser Mini | Same-SKU rows or cells; cap and tail kept away from case seams; no load through tail seal | Smallest tested corrugated mailer/RSC; paper restraint if the retail carton does not immobilize the tube | Cap opening/back-off, tail or shoulder leak, puncture, permanent crush, print/frost scuff, carton collapse |
| Cleanser Full | Fewer units per case or stronger divider if full tube bows under stack load; quote 12/24-unit alternatives | Corrugated, not an unpadded soft mailer, until filled drop/leak evidence shows otherwise; 120 mL exceeds USPS's 4-fl-oz breakable-liquid threshold only if its primary is breakable, but liquid containment remains relevant | Same as Mini plus bending/buckling and cap-to-tube contact in bundles |
| Serum Mini | Individual cell; top/bottom clearance; no compression through bulb, collar, pipette, or closure; no glass contact | Die-cut corrugated/molded fiber or suspension restraint; surface barrier only if abrasion testing requires it | Pipette fracture/contact, glass chip/crack, closure movement, leak, bulb damage, frosting/label abrasion, glass escape |
| Serum Full | Same principles with higher mass and longer pipette; quote 12/24 but release by gross case weight and compression result | Right-sized corrugated plus rigid restraint; generic void fill alone is not positive restraint | Same as Mini; dose and bulb recovery after sequence |
| Moisturizer Mini | Individual cell or cavity; top load bypasses closure and glass shoulder; keep bases from impact concentration | Rigid restraint with closure clearance; no jar-to-jar contact in multi-item basket | Glass chip/crack, base/sidewall fracture, closure back-off, liner/seal shift, leak, frosting abrasion |
| Moisturizer Full | Weight-driven case count may be lower; bottom/top pads and partitions sized from filled vertical-load evidence | Rigid die-cut/molded restraint; verify insert does not wedge load into jar wall/shoulder | Same as Mini plus case compression and handling ergonomics |
| Mixed DTC basket | Not an upstream master-case default; use same-SKU cases for traceability | A common outer can use modular cells only if every basket is restrained; glass cannot contact glass or tube caps; order components must not become impact projectiles | Any primary-to-primary contact, motion, mis-pack, missing dunnage, leakage transfer, unreadable label, unacceptable saleable appearance |

Carrier packing recipes are conservative controls, not optimized Helix designs. FedEx recommends sturdy outer boxes, individual cushioning and double-boxing for fragile goods, while UPS recommends sealed bags for bottles and a two-box method for fragile contents ([FedEx breakables](https://www.fedex.com/en-us/shipping/packing/how-to-pack/breakables.html), [FedEx general packaging guide](https://www.fedex.com/content/dam/fedex/us-united-states/services/HowToPack_fxcom.pdf), [UPS packaging tips](https://www.ups.com/us/en/support/shipping-support/packaging-tips)). **[SI]** A tested corrugated or molded-fiber restraint may use materially less cube than those generic recipes; an untested reduction may merely move cost from packaging into breakage and reshipment.

USPS imposes specific liquid controls. For breakable primary liquid containers over 4 fl oz, its current rule calls for absorbent material, a sealed leakproof secondary container, and a strong outer package unless ISTA 3A evidence demonstrates no liquid release; screw caps need at least 1.5 turns ([USPS DMM 601 §3.4](https://pe.usps.com/TEXT/DMM300/601.htm)). Applicability depends on final primary construction, contents, and service. Carrier compliance and performance testing are separate gates.

## Supplier and system screen

### Southern California master-case, divider, pallet, and warehouse-protection leads

| Candidate / role | Current first-party evidence | Commercial evidence near launch scale | Manufacturing identity / Southern California fit | Decision status and critical unknowns |
|---|---|---|---|---|
| **Ecko Products Group — converter/integrator** | **[SA]** Custom corrugated, trays, displays, flexo/litho-lamination and packaging services ([capabilities](https://eckopg.com/packaging)) | **[SA]** Stock-program MOQ 50; custom MOQ 500; custom lead 2–3 weeks; stock reorders 48 hours | **[SA]** 90,000-ft² Ontario, CA production/fulfillment site and Western-U.S. delivery with own trucks ([facility](https://eckopg.com/)) | **[L] First local RFQ cohort. [U]** Exact board mill, PCR/FSC transaction claim, tooling, ECT/BCT, price, freight, tolerances, test scope |
| **Acorn Paper / McKinley Packaging — manufacturer/distributor** | **[SA]** 1,600+ stock sizes and custom size/shape/board combinations ([about](https://acorn-paper.com/pages/about), [custom manufacturing](https://acorn-paper.com/pages/packaging-design-and-manufacturing)) | **[SA]** Most stock orders next day; published delivery thresholds of $500+, fee at $350–499, and $250 will-call, with higher outer-zone thresholds ([order minimums](https://acorn-paper.com/pages/faqs-orders-do-you-have-an-order-minimum)) | **[SA]** Los Angeles headquarters/distribution and corrugated production in Santa Fe Springs and Cerritos ([history](https://acorn-paper.com/pages/acorn-history)) | **[L] First local RFQ cohort; stock/JIT control. [U]** Exact custom MOQ/price/lead, board certificates, local manufacture for nominated item |
| **Packaging Corporation of America — integrated corrugated manufacturer** | **[SA]** Custom cases, interior protection, printing, design and transport-testing services ([capabilities](https://www.packagingcorp.com/), [services](https://www.packagingcorp.com/packaging-solutions/service/)) | Quote-only; **[U]** MOQ, price, tooling, lead | **[SA]** Full-line corrugated plant at 4240 Bandini Blvd., Los Angeles ([plant](https://www.packagingcorp.com/location/los-angeles-full-line-plant/)) | **[L] First local RFQ cohort. [SA]** Mills are SFI-certified; exact box recycled content/claim **[U]** ([shipping-box information](https://www.packagingcorp.com/packaging-solutions/need/contain-products/)) |
| **Crown Packaging — distributor/integrator** | **[SA]** Cases, partitions/slip sheets, edge protection, stretch film, pallets/crates, prototypes and drop/vibration testing ([Los Angeles branch](https://crownpack.com/store/los-angeles-california/), [design/testing](https://crownpack.com/packaging-services/custom-corrugated-design-services/)) | Quote-only; public PCR hand film, but no common case price | **[SA]** Riverside branch, warehouse and regional specialists; nominated converter for each custom component **[U]** | **[L] First integrated RFQ/test cohort. [SA]** One hand-film line states 25% PCR ([film](https://shop.crownpack.com/power-edge-pcr-handfilm/)); exact component certificates and load-containment data **[U]** |
| **Ernest Packaging Solutions — distributor/integrator** | **[SA]** Custom/stock corrugated, partitions, inserts, pallets/crates, edge protection, film and wrappers ([products](https://www.ernestpackaging.com/products/), [custom packaging](https://www.ernestpackaging.com/solutions/custom-packaging/)) | Quote-only; one customer case describes 90-day inventory/next-day release, not a general term ([JIT case](https://www.ernestpackaging.com/client-stories/ernest-to-the-rescue-coast-aluminum-national-visibility-meets-local-insight/)) | **[SA]** Los Angeles headquarters, design lab, custom pallet capability, 300,000-ft² warehouse ([LA facility](https://www.ernestpackaging.com/los-angeles-california/)) | **[L] First integrated RFQ/JIT cohort. [U]** Actual converter/site for each item, MOQ, inventory commitment, price, certificates, lab method/scope |
| **Imperial Paper — converter/integrator** | **[SA]** Corrugated cartons and chipboard/corrugated dividers/partitions ([cases](https://imperialpaper.com/product-category/corrugated-cartons/), [partitions](https://imperialpaper.com/product-category/dividers-partitions/)) | Historical 2020 first-party page stated prototypes/no-minimum low volume, 1–3-day design and 7–10-day JIT; current terms require confirmation ([historical terms](https://imperialpaper.com/blog/component-packaging-material-manufacturing-services/)) | **[SA]** North Hollywood and Greater-LA design/manufacturing | **[L] Local alternate. [U]** Current MOQ, lead, price, production site, board/PCR/FSC and test evidence |
| **Best Box Company — corrugated manufacturer** | **[SA]** RSC, FOL, die-cut and pallet cases, partitions/pads, short runs and multiple wall grades ([capabilities](https://www.best-box.com/)) | Quote-only | **[SA]** Supplier says it manufactures in Los Angeles and serves Southern California | **[L] Local industrial cost challenger. [U]** MOQ, price, lead, exact plant/tool, PCR/FSC/SFI, formal testing |
| **Uline — stock distributor/control** | **[SA]** Broad stock RSC, pads, edge protection, film and same-day availability | **E1 example:** 13 × 9 × 5-in 32-ECT RSC is $0.84 each at 1,000, before freight/tax; not a Helix design ([example](https://www.uline.com/Product/Detail/S-23955/Corrugated-Boxes-32-ECT/13-x-9-x-5-Lightweight-32-ECT-Corrugated-Boxes)) | **[SA]** 1.2-million-ft² Ontario warehouse; 99% of orders before 6 p.m. said to ship same day ([branch](https://www.uline.com/corporate/LACA)); actual manufacturer **[U]** | **[L] Transparent spot-buy/emergency control, not engineered qualification. [U]** Exact fiber claims, optimized geometry, performance with Helix packs |

### National, regional, and offshore corrugated/DTC leads

| Candidate / role | Offer and scale evidence | Timing / location | Material assertions | Decision status |
|---|---|---|---|---|
| **EcoEnclose — e-commerce packaging supplier** | **[SA]** Custom unprinted MOQ 1, branded MOQ 100, quote at 2,500+ ([boxes](https://www.ecoenclose.com/shop/custom-shipping-boxes/)) | **[SA]** 4–8 business days unbranded; 4–5 weeks branded; 2–3 weeks rush; Louisville, CO ([lead times](https://www.ecoenclose.com/lead-times/), [location](https://www.ecoenclose.com/contact-us/)) | **[SA]** 100% recycled fiber, 95% PCW, FSC Recycled `SCS-COC-009926`, curbside recyclability; exact transaction scope must be verified | **[L] First DTC RFQ/sample cohort; strongest public fiber detail. [U]** Exact converter, delivered quote, exact print/adhesive/coating, test evidence |
| **Fantastapack / SupplyOne — digital corrugated manufacturer** | **[SA]** No MOQ for online boxes/standard divider; engineered inserts generally MOQ 250–500 ([divider](https://www.fantastapack.com/products/divider-insert)) | **[SA]** Pages conflict between 10 and 10–15 business days standard and 5 versus 7 rush; production in Kent, WA and Lowell, AR ([timing](https://support.fantastapack.com/how-do-i-place-a-sample-order), [manufacturing](https://www.fantastapack.com/pages/custom-printed-boxes)) | **[SA]** Approximately 30–50% recycled content, SFI-certified North American suppliers, curbside-recyclable claim | **[L] First DTC RFQ/sample cohort; West Coast plant. [U]** Exact SKU claim, common delivered price, current cart timing, test evidence |
| **Digital Room group: Packlane, Packola, UPrinting — related storefronts** | Treat as one sourcing group, not three independent bids. **[SA]** Corrugated boxes generally MOQ 1; Packlane custom inserts may start at 2,000 ([Packlane MOQ](https://packlane.com/support/what-is-your-minimum-order-quantity), [inserts](https://packlane.com/support/do-you-sell-inserts), [Packola](https://www.packola.com/products/shipping-box), [UPrinting](https://www.uprinting.com/shipping-boxes.html)) | **[SA]** Packola/UPrinting at 8000 Haskell Ave., Van Nuys; pickup options exist; exact plant for nominated order **[U]** ([Packola](https://www.packola.com/pages/about-packola), [UPrinting policy](https://www.uprinting.com/site-policies.html)) | Storefront claims differ; exact PCR/FSC and converter **[U]** | **[L] One first-cohort DTC counterquote, selected by common configurator capability. Do not count related quotes as market independence.** |
| **Arka — custom packaging supplier** | **[SA]** Custom mailer MOQ 1; public “as low as” pricing is not configuration-complete ([mailer](https://www.arka.com/products/custom-mailer-boxes)) | **[SA]** 7–10 business days after proof plus up to 5 for 1,000+; U.S.-made assertion, exact plant **[U]** ([FAQ](https://www.arka.com/pages/faq)) | **[SA]** FSC Chain-of-Custody paper; exact PCR and transaction claim **[U]** ([sustainability](https://www.arka.com/pages/sustainability)) | **[L] First DTC RFQ/sample cohort. [U]** Complete delivered price, board mill/plant, certificate scope, timing ambiguity, tests |
| **Pratt Industries — integrated corrugated manufacturer** | **[SA]** Custom e-commerce packaging, kitting, warehousing, logistics and transit testing ([e-commerce](https://www.prattindustries.com/Ecommerce/)) | Quote-only; California manufacturing footprint is Lathrop/Salinas/Stockton, not Southern California ([locations](https://www.prattindustries.com/locations-all/)) | **[SA]** Integrated 100% recycled containerboard and water-based inks | **[L] National integrated scale/cost challenger. [U]** Nominated plant, MOQ, delivered cost, exact board claim/certificate, lead |
| **PackMojo — offshore sourcing platform** | **[SA]** Mailer MOQ 100; FSC option from 300 ([mailer](https://packmojo.com/custom-packaging/mailer-boxes/), [MOQ](https://packmojo.com/help/what-is-your-moq/)) | **[SA]** China partner network; production 12–16 days, potentially 3–4 weeks; air 1–3 weeks or ocean 4–8 weeks | **[SA]** At least 50% PCW across paper/cardboard, FSC `FSC-C198591`, soy ink ([sustainability](https://packmojo.com/sustainability/), [FSC](https://packmojo.com/custom-packaging/fsc-packaging/)) | **[L] Offshore P3 landed-cost control only. [U]** Exact factory, duty/HTS, freight cube, import fees, order certificate, lead validity, test evidence |
| **noissue — multi-hub supplier** | **[SA]** Premium mailer MOQ 2,000; custom size requires 5,000, so 2,000–3,000 works only for catalog dimensions ([mailer](https://noissue.co/shop/boxes/shipping-boxes/wholesale-custom-boxes/)) | **[SA]** Roughly 10–12 weeks; production may use Asian or U.S. hubs, configured origin **[U]** ([origin](https://help.noissue.co/hc/en-us/articles/51032977361689-Where-are-noissue-products-made)) | **[SA]** 85% recycled corrugate, FSC, compostability/recyclability claims; certificate/standard **[U]** ([specifications](https://help.noissue.co/hc/en-us/articles/52096126279705-noissue-Custom-Premium-Mailer-Boxes)) | **[L] Secondary fallback; custom-size MOQ and lead weaken launch fit.** |

### Protective-packaging, right-sizing, and testing systems

| Supplier/system | First-party capability | Cost/scale/operations boundary | Helix use and qualification boundary |
|---|---|---|---|
| **Ranpak FillPak / PadPak / Geami** | **[SA]** FillPak Trident produces paper void fill/blocking and bracing; Geami creates interlocking honeycomb paper wrap; PadPak Guardian explicitly covers cosmetics and fragile breakables ([FillPak](https://ir.ranpak.com/news/news-details/2020/Ranpak-Introduces-Enhanced-FillPak-Trident-Solution/default.aspx), [Geami](https://ir.ranpak.com/news/news-details/2023/Ranpak-Expands-Plastic-Free-Protective-Packaging-Offerings-with-North-American-Launch-of-Geami-MS-Mini-Wrapping-System/default.aspx), [PadPak](https://ir.ranpak.com/news/news-details/2020/Ranpak-Announces-North-American-Launch-of-PadPak-Guardian-Next-Generation-Cushioning-Solution/default.aspx)) | Quote/subscription/consumables mostly private. Manual FillPak M through Crown avoids electricity; automated systems target higher throughput. Supplier asserts paper recovery attributes. | **[L] Paper control from manual to automated.** Geami is surface/wrap protection, not automatically a rigid glass restraint. Require paper SKU, mass/order, converter terms, pack time and exact ISTA result. |
| **Pregis EasyPack / Pregis IQ** | **[SA]** EasyPack covers void fill, light cushioning, cushioning, wrapping, blocking/bracing; paper is stated as 100% recycled with FSC options ([systems](https://www.pregis.com/us-solutions/by-product/on-demand-paper-systems/), [cushioning](https://www.pregis.com/us-solutions/by-product/on-demand-paper-systems/accessories-and-consumables/paper-cushioning/)). Pregis describes ISTA-certified design/testing and opened a Lakewood/Los Angeles customer-experience center in 2026 ([testing](https://www.pregis.com/us-solutions/by-industry/third-party-logistics/), [LA center](https://www.pregis.com/knowledge-hub/pregis-opens-customer-experience-centers-in-atlanta-and-los-angeles-creating-more-access-to-customers-nationwide/)) | Quote-only; dispenser agreement, consumable minimum, local inventory, equipment/service, paper consumption and lab fees **[U]** | **[L] First protective-system cohort, particularly for glass.** Generic supplier claims do not qualify exact Helix packs. |
| **Storopack PAPERplus / PAPERbubble / AIRplus / FOAMplus** | **[SA]** Storopack offers paper padding, air-cushion and foam-cushion systems. PAPERbubble is a paper cushioning/wrapping format; AIRplus Mini Touch is a compact on-demand air system ([paper](https://www.storopack.us/products/flexible-protective-packaging/paper-padding/paperbubbler/), [air](https://www.storopack.us/products/flexible-protective-packaging/air-cushions/airplusr-mini-touch/), [foam](https://www.storopack.us/products/flexible-protective-packaging/foam-cushioning/)) | Quote-only; machine placement, service, consumable MOQ, film/paper specification, consumption per order and test support **[U]** | **[L] Strong Southern California consumables/control lead. [SA]** Storopack lists packaging facilities in Downey and Adelanto ([locations](https://www.storopack.us/company/about-us/storopack-worldwide/)). Paper/air/foam are separate architectures and must not share a qualification result. |
| **Pacific Pulp / Sonoco / Smurfit Westrock fiber restraints** | **[SA]** Pacific Pulp describes U.S. custom molded-pulp development and manufacturing; Sonoco offers partitions and protective paper packaging; Smurfit Westrock offers paper-based protective buffers ([Pacific Pulp](https://pacificpulp.com/about-2/), [Sonoco](https://www.sonoco.com/na/products/industrial-paper-packaging/protective-packaging-products), [Smurfit Westrock](https://www.smurfitkappa.com/us/products-and-services/packaging/protective-packaging-buffers)) | Quote-only; tooling, cavity MOQ, mold ownership, nested shipping cube, fiber formulation, moisture response, manufacturing site and lead **[U]** | **[L] Molded-fiber/honeycomb comparison set for glass restraint and case buffering.** A fiber name or molded shape is not evidence of transit performance, ordinary recovery, or lower burden. |
| **Sealed Air Korrvu** | **[SA]** Corrugated frame plus low-slip film suspends or retains fragile goods; stores flat; stock and custom formats; supplier says up to 50% recycled corrugated and right-sizing can lower DIM weight ([Korrvu](https://www.sealedair.com/products/protective-packaging/korrvu-suspension-retention-packaging)) | Quote-only; stocked sizes vary. Film/polymer, separability, actual recovery, MOQ, print, tooling, lead and local manufacturing **[U]** | **[L] First engineered glass-protection cohort.** A stock wine configuration has ISTA 3A evidence up to 750 mL, but that does not approve Helix geometry ([stock detail](https://prod.sealedair.com/ap/products/protective-packaging/korrvu-suspension-retention-packaging)). |
| **Sealed Air Instapak** | **[SA]** Fifteen foam formulations; on-demand custom-fit cushioning; systems and portable Quick RT formats ([Instapak](https://www.sealedair.com/products/protective-packaging/instapak-foam-packaging/instapak-foams-and-films)) | Quote-only; equipment, chemicals, operator training, disposal/recovery, foam mass, ventilation and consumer handling must be modeled | **[L] Damage-control exception for difficult glass, not default.** Advance only if fiber/corrugated systems cannot pass at acceptable cube/cost. |
| **Packsize On Demand / PackNet** | **[SA]** Fanfold corrugated systems generate right-sized RSC/HSC and other styles from order/product data; published throughput spans about 240 to 1,500+ boxes/hour depending on system ([FAQ](https://www.packsize.com/resources/faq), [automation](https://www.packsize.com/solutions/packaging-automation), [software](https://www.packsize.com/software)) | Managed-subscription/equipment/material pricing, minimum throughput and 3PL availability **[U]** | **[L] Later-stage 3PL/automation hypothesis.** At launch, first ask whether the selected 3PL already operates compatible equipment; buying a machine for 1,000–3,000 primaries is not publicly justified. |
| **Veritiv custom packaging/testing** | **[SA]** Custom design/prototyping and seven ISTA-certified labs; vibration, compression, shock and environmental capabilities ([custom](https://www.veritiv.com/custom-packaging-solutions), [testing](https://www.veritiv.com/services/package-testing)) | Quote-only; Veritiv acquired Packaging Solutions in 2025 to expand Southern California reach ([acquisition](https://ir.veritiv.com/newsroom/Press-Release-Details/2025/Veritiv-Acquires-Packaging-Solutions-Strengthening-Reach-in-Southern-California/default.aspx)) | **[L] Integrated national design/test counterquote. [U]** Local facility, manufacturer for nominated item, MOQ, price, exact lab/method scope and schedule. |
| **FedEx Packaging Lab — carrier test/design control** | **[VF]** Active business-account holders can obtain basic small-parcel/freight distribution testing and packaging design without a lab fee; shipper pays inbound freight. The April 2026 application requires the exact configuration and lists 4–8 business-day results by request type ([instructions](https://www.fedex.com/en-us/shipping/packaging/testing/application-instructions.html), [2026 application](https://www.fedex.com/content/dam/fedex/us-united-states/shipping/upload/Package_Test_Application_Rev_042026.pdf)) | Carrier-specific control, not independent supplier qualification; advanced testing is fee-based | **[L] Useful supplemental test path after exact prototypes exist.** Do not substitute a carrier procedure for the route-appropriate full quality plan or assume it covers other carriers. |

### Pallets, unitization, and load containment

| Supplier/system | Public evidence | Commercial/route boundary | Role in the comparison |
|---|---|---|---|
| **CHEP pooled 48 × 40 wood block pallet** | **[SA]** 48 × 40 × 5.6 in, four-way entry, 2,800-lb uniformly distributed design load; CHEP manages delivery, recovery, inspection and repair ([pallet](https://www.chep.com/us/en/products/pallets/pooled-wood-block-pallet), [pool model](https://www.chep.com/us/en/why-chep/how-chep-works)) | Custom quote; receiver participation, issue/transfer fees, daily dwell, loss, off-network recovery, export eligibility and exact local service point **[U]** | **[L] Pooling comparator for recoverable North American B2B lanes.** Do not send pooled assets into an unrecoverable export/customer route. |
| **Signode containment and test system** | **[SA]** Stretch film/wrappers, strapping, edge protection, tier sheets, top frames, dunnage and packaging labs offering drop, stability, incline impact, conditioning, random vibration and fork-truck rough handling ([unitize](https://www.signode.com/en-us/systemsandsolutions/unitize/), [lab](https://www.signode.com/en-us/customer-experience-center/packaging-lab/)) | Quote-only. California engineering/manufacturing sites are Bay Point and Stockton, with Pittsburg distribution—not Southern California ([locations](https://www.signode.com/locations/)) | **[L] Load-containment/test challenger.** Require film grams/load, PCR transaction evidence, measured containment force, wrap pattern and tested pallet configuration. |
| **Lantech G-Series semiautomatic wrapper** | **[SA]** Entry system up to 25 loads/hour; supplier says controlled pre-stretch can reduce film versus hand wrapping ([G-Series](https://www.lantech.com/product/g-series/)) | Equipment price, service, film, footprint, utilization and labor savings **[U]** | **[L] Automation sensitivity only.** Compare to hand wrap at actual loads/shift; supplier percentage is not a Helix saving. |

## Reusable DTC system screen and the BOOX boundary

### What is actually verified about BOOX and Rhode

On the research date, Rhode's own impact page says Rhode products arrive in BOOX shippers, describes the scan-and-drop-off return path, and shows a Rhode-branded BOOX image. BOOX's live Rhode scan experience is also present. This is fresh first-party confirmation of a **Rhode ↔ BOOX DTC shipper relationship [SA]**, not proof that BOOX supplies Rhode's tubes, bottles, droppers, jars, folding cartons, labels, or protective inserts ([Rhode](https://www.rhodeskin.com/pages/sustainability), [BOOX Rhode scan](https://my.boox.eco/scan-demo/rhode)). No product-level primary- or secondary-packaging relationship is inferred.

BOOX identifies itself as a packaging supplier and lists Rhode among customer logos; it offers reusable boxes as well as custom corrugated boxes, poly shippers, and paper mailers. A logo is relationship evidence only at the unspecific supplier level unless the brand states the product and scope ([BOOX packaging](https://boox.eco/pages/packaging)).

The reusable BOOX offer has meaningful public operating detail **[SA]**:

- Corrugated-polypropylene boxes can be customized in dimensions, colors and graphics and carry a unique QR code; BOOX says it handles consumer recovery and refurbishment through return locations ([operating model](https://boox.eco/pages/how-boox-works)).
- BOOX states a general 10+ reuse life, a 1,000-units-per-month plus annual-contract threshold for custom sizing/branding, a 10–14-business-day online-order lead, and U.S./Canada/U.K. availability. These are supplier terms and design-life assertions, not achieved Helix rotations ([FAQ](https://boox.eco/pages/faq)).
- The small-business collection describes packs of 100 and a 100–500-box range, but displayed **zero current products** on the research date. The $5 sample-pack page was sold out. Public product availability is therefore not established ([collection](https://boox.eco/collections/boox-boxes), [sample](https://boox.eco/products/box-samples)).
- The BOOX Bag page advertises “starting at $0.13/shipment.” That is an E1 marketing floor for a bag with no disclosed size, volume commitment, return rate, recovery geography, cleaning, replenishment, loss or reverse-postage scope; it cannot price a rigid glass-protective BOOX system ([bag](https://boox.eco/pages/the-reusable-boox-bag)).

BOOX's commissioned historical life-cycle model is useful only as a scenario artifact **[SA]**. It modeled a 255.1-g polypropylene box, 50% recycled input, an 85% recovery assumption and up to 12 uses. It is not a current achieved-return audit, a Helix BOM, a common comparison with the launch baseline, or authorization for a consumer claim ([BOOX LCA methodology](https://cdn.shopify.com/s/files/1/0485/9949/8919/files/Boox_LCA_Methodology.pdf?v=1636430706)).

### Reuse and return-system alternatives

| Candidate / model | First-party commercial and operating evidence | Fit for glass skincare | Decision status and missing proof |
|---|---|---|---|
| **BOOX — network-managed rigid box/bag service** | **[SA]** Recovery/refurbishment is operator-managed; standard and custom formats exist; custom threshold is 1,000 units/month plus annual contract ([how it works](https://boox.eco/pages/how-boox-works), [FAQ](https://boox.eco/pages/faq)) | A rigid format can host a separable tested insert, but no public Helix-like glass configuration or route result was found | **[L] U.S. pilot leader. [U]** All-in price, achieved return/time-to-return/loss distributions, condition grades, cleaning SOP, hygiene validation, exact refurbishment nodes, reverse carrier cost, inventory float, protection test, end-of-life yield |
| **LimeLoop — brand-managed reusable mailer** | **E1/SA:** current five-packs are $60 X-Small, $68 Small, $78 Medium and $74 Large; supplier says consumers flip a prepaid label and mail back. The 8 × 11 × 3-in Small is $13.60 per asset before return logistics ([shop](https://www.thelimeloop.com/shop)) | Flexible mailer is not positive restraint for glass. It would still need an inner box/insert and exact leak/shatter tests, weakening cube and simplicity | **[L] Transparent asset-price control; not a launch glass system. [U]** Commercial-scale quote, reverse postage, achieved rotations, cleaning, loss, replacement, SoCal operations |
| **EcoEnclose ReEnclose — brand-managed mailer** | **[SA]** Stock MOQ 10; custom MOQ 2,500. Its own decision guide warns that empty-return models add estimated return shipping of $3.50+ and require tracking/cleaning; the page says reuse can be worse in some conditions ([reusable program](https://www.ecoenclose.com/shop/reusable-packaging)) | Useful only with a separate rigid glass protector or for a future nonbreakable assortment | **[L] Valuable operational/cost control.** Supplier estimate is not a carrier quote; exact asset price, return contract and achieved loops **[U]** |
| **RePack — pooled/managed e-commerce bags** | **[SA]** RePack offers a reusable-packaging service and reports a 75% return rate in its FAQ; service pages identify a Europe-centered network ([service](https://www.repack.com/services/e-commerce), [FAQ](https://www.repack.com/faq)) | Flexible outer needs a rigid glass subsystem; transatlantic reverse movement would be perverse unless a U.S. loop exists | **[L] European business-model benchmark, not a current Southern California sourcing finalist. [U]** U.S. service, pricing, nodes, Helix pack protection, independently verified return distribution |
| **Movopack / Hipli — European managed system** | **[SA]** Custom reusable e-commerce packaging and reverse-logistics software; Movopack announced the Hipli acquisition in 2025 and describes European deployment ([offer](https://movopack.com/solutions/ecommerce), [acquisition](https://movopack.com/press/movopack-acquires-hipli)) | Candidate only if a rigid or insert-compatible U.S. format and node become available | **[L] European comparator. [U]** U.S. operations, MOQ, all-in price, achieved loops, exact materials, cleaning and Helix test |
| **Returnity Last Box — closed-loop B2B tote/box** | **[SA]** Returnity markets a reusable box system for closed-loop retail/logistics; its FedEx collaboration targets business-to-business recurring lanes ([Last Box](https://www.returnity.co/the-last-box), [FedEx case](https://www.returnity.co/blog/fedex-and-returnity-launch-new-reusable-box-solution-for-b2b-shippers)) | Better fit for predictable 3PL↔filler or replenishment loops than open-loop consumer parcel returns | **[L] Future closed-loop B2B comparator. [U]** SoCal lane network, asset/fee/loss schedule, wash/inspection, exact case protection and receiver acceptance |
| **FedEx reusable packaging — carrier-supplied Pak** | **[VF/SA]** FedEx describes a reusable Pak with a resealable closure for an outbound and return shipment ([packaging](https://www.fedex.com/en-us/shipping/packing/supplies/sustainable-packaging.html), [return instructions](https://www.fedex.com/en-us/customer-support/faqs/returning/returns/reusable-packaging.html)) | This is ordinary merchandise-return packaging, not a multi-rotation pooled glass shipper | **[L] Two-way return control only.** Carrier/service eligibility, inner glass protection and contracted rates remain separate |

### Reuse decision rule

“Reusable” is a design intent, not an achieved result. The pilot must cohort-track every serialized asset from first service through each return, rejection and loss. Report at least return probability by elapsed day, return location, usable/refurbishable/rejected condition, cleaning/rework time and cost, outbound and reverse miles/service, inventory dwell, customer incentive, missing-asset cost and realized rotations. California's SB 54 permanent regulations require a reuse/refill plan to address durability, convenience, safety, environmental risks and average uses/refills; that reinforces achieved-loop evidence rather than a theoretical maximum ([CalRecycle SB 54 regulations](https://www2.calrecycle.ca.gov/Docs/Web/138757)).

**[SI] Pilot gate:** BOOX may advance only as a limited opt-in or bounded-cohort pilot after a one-way pack passes, because a failed or late reusable loop must fall back to a qualified one-way shipper. Do not represent the pilot as lower-cost or lower-impact until achieved cohort data clear both break-even thresholds with uncertainty.

## Existing skincare and beauty DTC benchmark

Public brand pages are much less informative than supplier pages. They can reveal an architecture or customer relationship, but they do not disclose a complete bill of materials, converter, delivered cost or transport release.

| Brand | First-party finding | What may and may not be learned |
|---|---|---|
| **Rhode** | **[SA]** Explicit BOOX shipper, return scan, reuse and paper/FSC insert assertions ([impact page](https://www.rhodeskin.com/pages/sustainability)) | Valid benchmark for a named DTC-shipper relationship. It does not identify primary-pack suppliers or prove Rhode's box economics, achieved rotations, or applicability to Helix glass. |
| **Aesop** | **[SA]** Aesop says paper/cardboard packaging is sourced from FSC/PEFC-certified sources and is recyclable where accepted ([packaging materials](https://us.assistance.aesop.com/hc/en-us/articles/7406664205327-What-materials-do-Aesop-utilise-in-its-packaging)) | Supports fiber-provenance RFQ fields, not a named DTC converter, case design, cost or route pass. Product aesthetics must not be mistaken for the transport system. |
| **The Ordinary / DECIEM** | **[SA]** DECIEM says its e-commerce packaging is recycled and recyclable ([DECIEM packaging](https://theordinary.com/en-us/deciem-earth-packaging.html)) | Directional material benchmark only. Component weights, PCR fraction, supplier, insert design, price and exact test evidence remain **[U]**. |
| **Anua** | **[U]** No decision-grade, first-party public DTC shipper system, named supplier, BOM or route evidence was found in the reviewed sources | Do not fill the gap with retailer images, marketplace listings or assumptions about Korean skincare supply chains. Treat any later supplier/customer claim as a lead to corroborate. |

The benchmark conclusion is deliberately narrow: **[SI]** Helix should borrow evidence fields and test questions, not copy an unknown packout. Brand use is not supplier qualification.

## System designs to quote and prototype

Each architecture below is a separate candidate. A supplier-proposed variation receives a new candidate ID and cannot overwrite the common baseline.

| ID | System design | Primary use | Benefits to test | Costs/risks to expose | Current disposition |
|---|---|---|---|---|---|
| **MC-1** | Locally converted RSC master case + die-cut corrugated partitions + top/bottom pads + tape + manual pallet containment | Overseas/domestic finished-goods cases; all Products | Local lead/freight, familiar line handling, flat storage, material-efficient cells | Tooling, partition labor, scuffing, humidity strength loss, case-count proliferation | **Baseline [SI].** Quote Ecko, Acorn/McKinley, PCA plus one integrated alternate. |
| **MC-2** | RSC + custom molded-fiber tray/cell set | Serum and cream glass | Positive geometry, nestable parts, paper-based appearance | Tooling/MOQ, mold lead, moisture response, cavity tolerances, jar/bottle cosmetic scuff, nested inbound cube | **Prototype challenger [L].** Quote Pacific Pulp plus one national alternate. |
| **MC-3** | RSC + corrugated/honeycomb buffer frame | Heavy glass or high-stack lanes | Load path can bypass glass/closure; industrial compression resistance | Added mass/cube, tooling/conversion, overdesign | **Contingency [L].** Advance only if MC-1/MC-2 cannot meet compression/damage target. |
| **DTC-1** | Plain right-sized RSC/mailer + die-cut corrugated insert | Single/multi-item orders | Lowest-complexity local baseline, flat storage, familiar recycling stream | More insert SKUs, assembly labor, print tradeoff, poor fit if dimensions change | **First release baseline [SI].** Use plain/one-color outer before decorative complexity. |
| **DTC-2** | Right-sized outer + molded-fiber cavity | Serum/cream singles and glass bundles | Positive restraint, premium presentation, nested storage | Tooling, MOQ, dust/fiber transfer, surface scuff, moisture, reconfiguration cost | **First prototype challenger [L].** |
| **DTC-3** | Right-sized outer + on-demand paper pad/wrap | Flexible baskets and exception handling | Low tooling, adaptive packout, manual-to-automated path | Variable grams/order and labor; wrap may not prevent glass contact; operator inconsistency | **Control/challenger [L].** Quote Ranpak, Pregis and Storopack on measured use. |
| **DTC-4** | Korrvu suspension/retention in corrugated outer | Fragile glass singles | Positive restraint with stock/custom path; potential cube reduction versus generic double-box | Film separation/recovery, stock-size mismatch, material/price/tooling | **Engineered challenger [L].** |
| **DTC-5** | Foam-in-place in right-sized outer | Repeated failure of fiber systems | Conforms to difficult geometries and can reduce movement | Equipment/chemical controls, consumer disposal, high material complexity, presentation | **Exception only [SI].** Do not advance before fiber systems fail an evidence-based cost/performance trade. |
| **DTC-6** | On-demand corrugated right-sizing at 3PL | Mature order volume and varied baskets | Lower void/cube, SKU reduction, automation | Machine/subscription, integration, uptime, labor displacement, board supply, throughput minimum | **Future 3PL capability [L].** Ask whether the chosen 3PL already has Packsize or equivalent; do not buy at launch without throughput case. |
| **DTC-7** | BOOX rigid reusable outer + separately qualified modular restraint | Opt-in U.S. reusable pilot | Managed recovery, QR tracking, durable outer, visible brand program | Asset float, return/loss/dwell, cleaning, reverse movement, custom monthly minimum, fallback one-way pack | **Pilot only [SI].** No launch dependency. |

## Public price evidence and what it does not prove

Public prices create sanity checks, not a finalist ranking. They are E1 observations on the research date and exclude tax, freight, negotiated discounts, fit, labor, damage and most qualification costs.

| Cost control | Public observation | Normalized use | Exclusions / decision meaning |
|---|---:|---|---|
| Uline 13 × 9 × 5-in, 32-ECT RSC | **$0.84 each at 1,000 [SA/E1]** ([product](https://www.uline.com/Product/Detail/S-23955/Corrugated-Boxes-32-ECT/13-x-9-x-5-Lightweight-32-ECT-Corrugated-Boxes)) | Stock outer-box order-of-magnitude only | Not a Helix size; no insert, print, tape, inbound freight/tax, assembly, test or damage cost |
| Uline 9 × 9 × 12.5-in, 275-lb double-wall case | **$2.76 at 15; $2.40 at 240 [SA/E1]** ([product](https://www.uline.com/Product/Detail/S-4816/Heavy-Duty-Boxes/9-x-9-x-12-1-2-275-lb-Double-Wall-Corrugated-Boxes)) | Heavy-duty case sensitivity | Buying stronger board is not proof of lower damage or required compression performance |
| Uline 8 × 8-in, 0.022-in chipboard pads | **$39 per 675, or $0.0578 each [SA/E1]** ([product](https://www.uline.com/Product/Detail/S-19751/Corrugated-Pads/8-x-8-Chipboard-Pads-022-thick)) | Pad-price floor for unrelated dimensions | Not a partition or qualified cushioning element; freight/tax excluded |
| Uline light-duty edge protectors | **$139 per 125, or $1.112 each [SA/E1]** ([product](https://www.uline.com/BL_8400/Light-Duty-Edge-Protectors)) | Pallet-corner material control | Quantity used per load, length, strength, freight and recovery not fixed |
| Uline hand stretch film | **$18 per roll [SA/E1]**; listed 0% recycled content ([product](https://www.uline.com/Product/Detail/S-14156)) | Hand-wrap cash control | Film length/width/gauge, actual grams/load, core loss, labor, containment and damage not normalized |
| BOOX sample pack | **$5, sold out [SA/E1]** ([sample](https://boox.eco/products/box-samples)) | Evidence that samples were publicly merchandised | Not production availability, service fee, asset price or per-successful-cycle cost |
| BOOX Bag marketing floor | **Starting at $0.13/shipment [SA/E1]** ([bag](https://boox.eco/pages/the-reusable-boox-bag)) | Lower-bound lead only | Product/size/volume/returns/cleaning/reverse logistics and protection scope undisclosed |
| LimeLoop reusable mailer asset | **X-Small $12; Small $13.60 per asset in five-packs [SA/E1]** ([shop](https://www.thelimeloop.com/shop)) | Transparent reusable-asset cash benchmark | No production-scale discount, return postage, cleaning, loss, inner glass pack, handling or achieved-use divisor |

**[SI]** The public controls show why “unit price” is structurally misleading: an $0.84 outer can be more expensive than a higher-priced engineered shipper if the latter reduces labor, DIM weight or damage; a $0.13 reusable-service floor can be more expensive if it excludes the dominant reverse-logistics and asset-loss terms. Only a common P3/P4 reconstruction can compare them.

## Cost-benefit model for a common comparison

The [landed-cost evidence model](./packaging-landed-cost-evidence-model.md) remains authoritative. This section specifies how tertiary and DTC values enter it. P3 is inventory accepted at the named Southern California dock; P4 is a separate fulfilled-order view.

### P3 upstream cost per accepted saleable unit

```text
P3TertiaryCostPerAcceptedUnit =
  (MasterCases
   + PartitionsOrTrays
   + PadsAndLiners
   + TapeAndLabels
   + PalletsAndTierSheets
   + EdgeProtectionAndContainment
   + ToolingAndSetupAllocatedToConsumedUnits
   + PackagingInboundFreightToPackLine
   + CasePackingAndPalletizingLabor
   + PackagingStorageAndCarryingCost
   + ExportHandlingAndMainCarriageAllocation
   + DutyTaxBrokerExamAndDrayageAllocation
   + SoCalReceivingInspectionAndExceptionCost
   + EvidenceSupportedDamageLeakageReworkAndObsolescence)
  / AcceptedSaleableUnits
```

First-run cash and consumed economic cost must both be shown. A 3,000-piece insert order for a 1,000-piece run may be cash-paid now but only partly consumed; the balance creates inventory, storage, cash, change-obsolescence and disposal exposure. Tooling is likewise reported as cash and as a transparent per-unit allocation with no unsupported future-volume assumption.

### P4 one-way DTC cost per successfully delivered order

```text
P4IncrementalCostPerOrder =
  DTCOuter
  + InsertAndProtection
  + TapeLabelAndConsumables
  + PickPackQualityAndExceptionLabor
  + PackagingInboundFreightAndStorage
  + ParcelBaseChargeAtBillableWeight
  + FuelResidentialDeliveryAreaAndOtherApplicableAccessorials
  + ExpectedDamageLeakageLossAndReshipment
  + OrdinaryReturnPackagingEffect
```

The denominator is successfully delivered orders, not shippers purchased or packages inducted. Report single-Product Mini, single-Product Full, two-item, three-item/core-routine and realistic mixed-basket formats separately. Weighted average order cost uses the observed basket and zone mix; do not use a guessed “typical order” to award a supplier.

### Reuse cost per successfully completed service

```text
ExpectedCompletedServicesPerAsset =
  sum for service k = 1..K of Probability(asset completes service k)

ReusableCostPerCompletedService =
  (AssetPurchaseAndCustomization
   + InitialInboundAndInventoryFloat
   + OutboundPackLaborAndProtection
   + OutboundParcelCharge
   + QRDataPlatformAndCustomerIncentive
   + ReversePostageOrCollectionAndConsolidation
   + ReturnReceivingSortingCleaningDryingAndRepair
   + RepositioningAndStorage
   + RejectedAssetAndLossReplacement
   + EndOfLifeHandling
   + FallbackOneWayPackaging)
  / SuccessfullyCompletedServices
```

Model the low, expected and high cases from achieved pilot cohorts. At minimum, vary return probability, time-to-return, usable yield after inspection, reverse charge, cleaning/repair, missing asset rate, required fleet float and glass-damage rate. A maximum-use claim is never the denominator. Avoid double counting: if an operator's per-use fee includes asset, return and cleaning, those lines are included in the fee and marked, not added again.

### Pack labor and automation

Time production-equivalent packouts rather than asking operators to estimate. Each work element receives observed mean, spread, rework and training status:

| Work element | One-way case/mail system | Reusable system | Measurement needed |
|---|---|---|---|
| Material presentation | Erect outer; stage insert/paper/tape | Stage inspected asset and inner restraint | Seconds/order, reach/travel, replenishment interruptions |
| Product restraint | Fold/cell/seat/wrap/fill | Seat modular restraint; ensure no old label/contamination | Seconds by basket; mis-pack and rework rate |
| Closure/label | Tape or self-seal; carrier label | Integral closure; QR/serial and carrier label | Consumable units; scan exceptions; tamper evidence |
| Quality check | Movement, closure, label, leakage appearance | Same plus asset condition/cleanliness | Seconds and reject codes |
| Returns | Ordinary merchandise-return processing | Receive, identify, inspect, clean, dry, repair, store, replenish | Labor by condition grade; dwell and usable yield |

```text
LoadedLaborCostPerPack =
  observed seconds per compliant pack / 3,600 × loaded labor cost per hour

AutomationCostPerPack =
  (lease or depreciation + service + software + utilities + floor space
   + downtime + operator labor + consumables + changeover loss)
  / compliant packs produced
```

**[SI]** Manual paper or die-cut systems are likely economically safer at initial scale because they avoid underutilized equipment, but this is not an award conclusion. A selected Southern California 3PL may already own right-sizing, paper or wrapping equipment; its incremental run rate can beat Helix ownership. Request both “3PL-installed” and “new dedicated equipment” offers where relevant.

### Damage, leakage and reshipment

```text
ExpectedFailureCostPerOrder =
  P(pack-caused failed delivery)
  × (P3 replacement inventory value
     + replacement DTC materials
     + repeat pick/pack
     + repeat parcel charge and accessorials
     + nonrecoverable original freight
     + claims/customer-service handling
     + evidence-supported refund, disposal or recovery cost)
```

Track breakage, leakage, cosmetic scuff, closure movement, pipette/dropper damage, tube crush, label failure and outer damage separately by configuration, zone, carrier/service and weather period. Carrier reimbursement is not assumed: record filed, accepted, denied and collected values. A low observed rate from too few shipments stays uncertain; it does not become zero.

## Billable dimensional weight and right-sizing

Parcel geometry can dominate a light order. FedEx's current U.S. guidance calculates dimensional weight from cubic inches divided by 139 and charges the greater of dimensional and actual weight; its 2026 service guide defines measurement/rounding and surcharge rules ([FedEx dimensional weight](https://www.fedex.com/en-us/shipping/packaging/what-is-dimensional-weight.html), [2026 service guide](https://www.fedex.com/content/dam/fedex/us-united-states/services/Service_Guide_2026.pdf)). UPS publishes a 139 divisor for Daily Rates and 166 for Retail Rates, with its own whole-inch rules; the applicable contract and service control ([UPS dimensions and weight](https://es-us-filexfer.ups.com/us/en/support/shipping-support/shipping-dimensions-weight), [2026 Daily Rates](https://assets.ups.com/adobe/assets/urn:aaid:aem:356d938a-4f0a-4c71-b50e-bdd890f50b47/original/as/daily-rates-us-en.pdf), [2026 Retail Rates](https://assets.ups.com/adobe/assets/urn:aaid:aem:47caed8a-c6fe-41e9-b98f-63f89d3d3f6c/original/as/retail-rates-us-en.pdf)). USPS's rules effective July 12, 2026 apply dimensional-weight pricing above one cubic foot with a 139 divisor for the listed services ([USPS Ground Advantage](https://pe.usps.com/text/dmm300/223.htm), [USPS Parcel Select](https://pe.usps.com/text/dmm300/283.htm)). **[VF]** Rates and rules must be rechecked at quote and launch.

```text
MeasuredCubeIn3 = carrier-rounded length × width × height at sealed extremes
DimensionalWeight = MeasuredCubeIn3 / applicable divisor
BillableWeight = greater of carrier-rounded actual and dimensional weight
```

Illustrative geometry only—these are not proposed Helix boxes:

| Sealed outer | Cube | DIM at divisor 139 | Why one inch matters |
|---|---:|---:|---|
| 10 × 8 × 4 in | 320 in³ | 2.30 lb before required billing rounding | A low-mass order can bill at 3 lb under a whole-pound rule |
| 11 × 9 × 5 in | 495 in³ | 3.56 lb before required billing rounding | The apparently small increase adds 54.7% cube and can move the billable tier to 4 lb |
| 12 × 10 × 6 in | 720 in³ | 5.18 lb before required billing rounding | Excess void can make a light skincare order bill at 6 lb |

For each basket, record the final sealed extreme dimensions, actual packed weight, rate card/account, service, origin ZIP, zone/destination distribution, divisor, rounding, minimums and every applicable surcharge. UPS explicitly warns that size/weight errors can generate corrections and additional handling; dimension capture is therefore a cost-control process as well as a design input ([UPS fee guidance](https://www.ups.com/us/en/support/shipping-support/shipping-dimensions-weight/avoid-additional-shipping-fees)).

**Right-size rule [SI]:** minimize expected P4 cost subject to the exact pack passing, not empty space alone. A smaller outer that increases glass impact, pack time or mis-pack can lose to a larger validated design. Conversely, generic double-boxing may protect but impose avoidable DIM cost; test engineered restraint against that conservative control.

## Master-case cube, pallet utilization and freight

Use a 48 × 40-in pallet as the domestic pattern baseline because that is the published CHEP U.S. block-pallet footprint, but verify origin/export pallet rules and every receiver's acceptance ([CHEP](https://www.chep.com/us/en/products/pallets/pooled-wood-block-pallet)). No overhang is allowed in the baseline.

```text
CaseVolume = external case length × width × height
CaseCubeUtilization = sum of packed primary/secondary bounding volumes / CaseVolume

CasesPerTier = maximum feasible non-overhanging layout,
  testing both orientations and interlocked patterns where compatible with strength

TiersPerPallet = minimum of:
  floor(allowed loaded height / case height),
  floor(allowed gross pallet weight / gross case weight),
  compression-limited tier count from validated top-load model

UnitsPerPallet = units per case × cases per tier × tiers per pallet
PalletCubeUtilization = occupied case footprint / (48 × 40) × used height / allowed height
```

Do not maximize units per case in isolation. Heavy Full cream jars may become case-weight- or compression-limited; small Minis may become cube- or manual-count-limited. Case alternatives must report:

- inner and outer dimensions, gross/net/tare mass, units/case, divider/tray mass and flat or nested inbound volume;
- board construction, ECT/BCT or agreed compression property, flute, seam, print, moisture condition and safety factor assumptions;
- case orientation, tier pattern, overhang/underhang, tiers, total height/weight, stability, clamp/fork exposure and stack-duration assumption;
- pallet type/ownership, heat treatment or export marking where applicable, tier sheets, top frame, edge protection, straps/film and measured containment force;
- cases/pallet, units/pallet, pallets/container or trailer, void/deck-space loss and weight/cube limiting factor.

LTL cost can change with density, dimensions, handling and the applicable NMFC item. NMFTA explains that packaging decisions can affect shipment density and invoicing, but the exact commodity classification and carrier tariff must be confirmed for the finished goods ([NMFTA packaging and class](https://nmfta.org/news/packaging-and-class-how-packaging-decisions-change-density-and-your-invoice/), [density](https://nmfta.org/news/decoding-density-the-freight-factor-you-cant-afford-to-overlook/), [classification standards](https://nmfta.org/standards/classification/)). **[SI]** Quote freight against each actual pallet pattern rather than applying a flat cost per unit.

### Warehouse and replenishment compatibility at the Southern California receiver

Before award, the named 3PL/receiver must approve pallet footprint/height/weight, pallet ownership/exchange, case weight, labels and barcode location, lot/date visibility, lot segregation, stacking orientation, maximum stack and storage environment. Capture appointment, unload, liftgate, lumper, pallet exchange, receiving, discrepancy, quarantine, relabel, bin/pallet storage, replenishment and disposal fees. None is included merely because a supplier says “delivered.”

Local vendors provide useful contingencies **[SI]**:

- Ecko Ontario, Acorn/McKinley Los Angeles-area plants, PCA Los Angeles and Best Box can compete on a defined local delivered case/partition BOM.
- Crown Riverside, Ernest Los Angeles and Storopack Downey/Adelanto can compete on stocked consumables, equipment/service and emergency replenishment.
- Uline Ontario is the stock cash/availability control.

Local presence is not local manufacture. The RFQ must identify the actual converting/production site and every cross-dock or warehouse leg for the nominated item.

## Test and validation architecture

ISTA identifies 3A for packaged products moving through parcel-delivery systems, 3B for less-than-truckload delivery and 3E for similar packaged-product unitized loads moving full-truckload from manufacturer to distribution center ([ISTA procedures](https://www.ista.org/test_procedures.php), [3A overview](https://ista.org/docs/3Aoverview.pdf), [3B overview](https://ista.org/docs/3Boverview.pdf), [3E overview](https://www.ista.org/docs/3E_26-26_Overview.pdf)). ASTM D7386 is a single-parcel distribution sequence; D4169 is a broader shipping-unit performance practice. D4332 addresses conditioning, D642 compression, D4728 random vibration, D5276 free-fall drop, and D6179 rough handling of unitized loads ([D7386](https://store.astm.org/d7386-25.html), [D4169](https://store.astm.org/standards/d4169), [D4332](https://store.astm.org/standards/d4332), [D642](https://store.astm.org/d0642-25.html), [D4728](https://store.astm.org/d4728-17.html), [D5276](https://store.astm.org/d5276-19r23.html), [D6179](https://store.astm.org/d6179-20r25.html)). **[VF]** The approved laboratory and quality owner select the current revision, assurance/test level, sequence and conditioning from the measured route; this report does not prescribe levels.

| Stage | Exact objects | Method family / evidence | Predefined output and gate |
|---|---|---|---|
| **0. Drawing and packout feasibility** | Each Mini/Full primary + closure/dropper + decoration + carton if any; every cell/insert/outer | Dimensional capability, fit, closure clearance, center of mass, tare/filled weight, assembly trial | Controlled drawing/BOM; no primary contact; no load through bulb/pipette/closure/tube tail; reproducible pack instructions |
| **1. Material and component characterization** | Corrugated, partitions, molded fiber, pads, tapes, film, pallet | Board/material certificates; conditioned compression; friction where needed; film/paper mass | Exact material/site/lot tied to specimen; properties meet approved limits |
| **2. DTC development screen** | Singles and realistic mixed baskets, exact filled Products, exact decoration | Instrumented/controlled handling where useful; closure/leak checks; iterative drop/vibration/compression development | Failure mode understood; candidate may advance, but development screen is not release |
| **3. DTC parcel qualification** | Production-equivalent sealed pack at minimum and maximum relevant weights/baskets | Route-selected ISTA 3A or ASTM D7386; carrier rule checks; environmental conditioning as justified | Approved report names every component/revision, sample, condition, sequence and result; observed critical failures = 0 under approved sample/acceptance plan |
| **4. Master-case/LTL qualification** | Exact same-SKU cases at worst relevant fill/case count | ISTA 3B or route-selected ASTM D4169; compression/vibration/drop components as justified | No glass escape, leakage, critical damage or loss of saleable/functional quality; case/pallet handling remains safe |
| **5. Unit-load qualification** | Exact pallet, pattern, height, containment and case lots | ISTA 3E for applicable FTL lane; D6179/D6055 rough handling; stability/impact/conditioning where justified | Stable, handleable unit; no unacceptable shift, collapse, case crush or Product failure; containment specification frozen |
| **6. Pilot lane surveillance** | Controlled outbound production lots across representative zones/carriers/weather | Scan, photo and claims data; damage/leak/cosmetic inspection; reusable cohort trace where applicable | Field result agrees with laboratory risk; deviations trigger containment and requalification scope |
| **7. Production surveillance** | Every received component lot and periodic packed Product | Incoming/line/release sampling; periodic audit/retest after risk review | Lot traceability, trend limits, change control and corrective-action closure |

ASTM D4577 covers compression resistance under constant load; D5639 addresses corrugated-board performance after wetting; D6055 addresses mechanical handling of unitized loads. They are available where measured storage, humidity or fork/clamp hazards justify them ([D4577](https://store.astm.org/d4577-19r23.html), [D5639](https://store.astm.org/d5639_d5639m-25.html), [D6055](https://store.astm.org/d6055-96r19.html)). Do not assemble a test list by habit; document the hazard-to-method rationale.

### Configuration-specific acceptance observations

The approved protocol must define critical, major and minor defects before testing. At minimum, treat glass chips/sharp fragments/escape, leakage, lost closure integrity, broken pipette, contamination, wrong component/lot, unreadable logistics label and loss of traceability as critical hard stops. Record tube puncture/tail/shoulder failure, bulb dose/recovery, closure torque movement, frosting/label scuff, jar liner/seal movement, case collapse, insert displacement, glass contact, pack movement and saleable appearance.

Observed zero critical failures in a finite test does not prove a zero field rate. Sample size, acceptance number, confidence rationale and escalation plan require quality approval. A supplier report qualifies Helix only when it identifies the exact Formula or justified simulant, fill mass, primary/closure/decoration, secondary, insert, outer, tape, packout, weight, lot, test revision/level, conditioning and laboratory; similar customer evidence remains **[L]**.

## Sustainability and compliance ledger

Sustainability is the established 15% weighted objective after safety, legality, compatibility, quality and transport gates. Apply the exact 15-point evidence-adjusted method in the [sustainability report](./packaging-sustainability-scoring.md); do not invent a material shortcut here. Score each Product × Variant × route and DTC basket separately unless the components, manufacturing sites, weights and logistics truly match.

| Component/system | Evidence required before scoring | Likely decision tension; not a conclusion |
|---|---|---|
| Corrugated outer/master case | Exact finished grams; flute/board/liners; PCR and other recovered content by weight; mill/converter; FSC/SFI/PEFC scope and transaction evidence where claimed; ink/coating/adhesive/tape; trim and yield; production energy/site; actual route; current recovery/access evidence | Right-sizing can reduce mass and DIM, but lighter board can raise damage; high recovered content does not prove the coated/printed/taped final item is accepted and reprocessed |
| Corrugated/chipboard partition or honeycomb | Exact grams/cell count; material and recovered-content evidence; flat/nested inbound cube; assembly labor; moisture strength; separability | Positive restraint can prevent glass loss, but redundant pads/cells add mass and labor |
| Molded-fiber insert | Fiber recipe/PCR; additives/colorants/coatings; mold and site; dry weight/moisture; trim/yield; nesting ratio; dust/scuff; ordinary recovery evidence | Premium geometry and possible nesting versus tooling, moisture, surface damage and uncertain exact recovery |
| Paper pad/wrap/void fill | Paper SKU, grams/order distribution, recovered content, certified sourcing, dispenser energy/service, pack time and test result | Adaptive and low tooling, but uncontrolled operator use can consume excess material and cube |
| Suspension/retention film | Corrugated and film grams/materials; separability instructions; labels/adhesive; access and actual recovery; fit/test | May reduce outer cube/damage, but mixed components and consumer separation can weaken recovery |
| Foam-in-place | Exact chemistry/grams; equipment and consumables; safety data; recovery access/end market; test benefit versus fiber | Strong protection can avoid Product loss, but material/end-of-life and operating complexity are high |
| Tape/label | Backing, adhesive, liner, grams/order, compatibility with repulping or plastic recycling, label removal and tamper function | Small mass may still affect separability and reusable cleaning; “paper tape” alone is insufficient evidence |
| Stretch film/strap | Resin, gauge, grams/load, PCR fraction and chain of custody, prestretch/containment, pallet failure rate and local film-recovery access | Downgauging/PCR can reduce virgin material only if load stability and actual yield remain acceptable |
| Wood pallet/tier sheet/edge board | Ownership, mass, reuse/repair rotations, heat treatment, loss, return miles; paper-component evidence | Pooling can spread asset burden on recoverable lanes; one-way export or off-network loss can erase that benefit |
| BOOX/reusable asset | Complete asset BOM/mass/PCR; manufacture; achieved cohort rotations; reverse miles/mode; cleaning water/energy/chemistry; repairs/loss; inventory float; inner protection; end-of-life yield | High achieved rotations may amortize an asset; low/slow returns, reverse postage, cleaning or glass inserts can make cost and burden worse |

The FTC defines recycled-content claims by weight and limits qualifying pre-consumer material; an unqualified claim can imply the whole named product/package except minor incidental components ([16 CFR § 260.13](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260/section-260.13)). The FTC also says a refillable claim requires a provided or reasonably available refill system; a container that technically could be reused is not enough ([16 CFR § 260.14](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260/section-260.14)). These rules apply to public claims, not merely supplier procurement language.

FSC labels and promotional marks require the applicable chain-of-custody/promotional authorization and controlled claim; a seller saying it “uses FSC paper” does not prove the exact order carries an FSC claim ([FSC chain-of-custody standard](https://open.fsc.org/handle/resource/302), [FSC U.S. promotional use](https://us.fsc.org/promotional-use)). Obtain the certificate code, scope/status, invoice/transaction claim and exact component before scoring or communicating.

California's Toxics in Packaging law restricts regulated metals in packaging and packaging components; supplier declarations must identify the exact inks, pigments, coatings, adhesives and components, not only corrugated board ([California DTSC](https://dtsc.ca.gov/toxics-in-products/toxics-in-packaging/), [purchaser fact sheet](https://dtsc.ca.gov/wp-content/uploads/sites/31/2016/01/TIPPurchasers_FINAL-1.pdf)). SB 54 creates producer-responsibility and source-reduction/recycling requirements for covered single-use packaging, and implementation continues through CalRecycle; retain component weights/material categories and confirm the responsible-entity and reporting position at launch ([CalRecycle packaging EPR](https://calrecycle.ca.gov/packaging/packaging-epr/), [permanent regulations](https://www2.calrecycle.ca.gov/Docs/Web/138757)). SB 343 constrains recyclability labeling and symbols based on current state criteria; a supplier or resin-code assertion does not authorize a Helix disposal claim ([CalRecycle SB 343](https://calrecycle.ca.gov/wcs/recyclinglabels/)).

**[SI] Claim-control rule:** the procurement score, transport pass, FSC certificate, resin code, customer logo and supplier LCA are separate evidence. None alone substantiates “sustainable,” “zero waste,” “recyclable,” “lower impact,” “plastic free,” “carbon neutral” or “reusable” for the complete delivered Helix system.

## Common RFQ, evidence and sample schedule

Issue one frozen request so bids are reconstructable. Quote the common baseline and every alternate separately. The public report remains citation-safe; supplier contacts, negotiated prices, private drawings and certificates belong in the controlled sourcing record.

### Candidate identity and manufacturing

1. Legal seller, ownership, address, tax/registration identity and contracting entity.
2. Actual converter/manufacturer for each component, exact manufacturing site, every subcontractor and every warehousing/cross-dock location.
3. Process map: board/pulp/resin source, corrugating/molding/converting, printing, gluing, packing, testing and distribution.
4. Quality-system certificate number, issuer/accreditation, scope, site and expiry where applicable; do not accept a logo.
5. Capacity at the nominated site, current utilization disclosure method, planned shutdowns, business continuity, backup site and whether a backup would require requalification.

### Controlled physical specification

1. Drawing/revision, assembled internal/external dimensions and tolerances; flat/nested dimensions; tare weight and tolerances.
2. Board grade/flute/ECT/BCT or material grade, thickness/caliper, density, fiber/resin/layer composition and critical properties.
3. Partition/tray cavity, finger clearance, top/bottom clearance, load path, closure/pipette/tube-tail clearance and assembly orientation.
4. Ink, coating, varnish, adhesive, tape, label/liner and every incidental component.
5. Units/bundle, bundles/case, component case dimensions/weight, cases/pallet, pallet dimensions/weight/height, stackability and storage conditions.
6. Controlled artwork/dieline, color standard, print process, registration, scuff/rub and change-control process.

### Common quantities and commercial schedule

Request separate prices at the actual derived quantities for 1,000, 2,000 and 3,000 primary-unit production scenarios and their Mini/Full split. Also request the supplier's efficient breakpoints. For each line include:

- unit price and currency; MOQ/order multiple; setup, plates/dies/molds, proofs, samples, testing, equipment, data/platform and recurring fees;
- ownership, location, expected life, maintenance and disposal/transfer rights for tooling;
- overrun/underrun tolerance, accepted quantity billing, scrap, minimum invoice, payment/milestone and cancellation/change terms;
- Incoterm/year and named place or explicit domestic delivery term; freight, fuel, tax, duty, brokerage and accessorial inclusion/exclusion;
- defect/replacement/warranty/claim terms and who pays sorting, rework, recall, expedite, reshipment and destruction;
- stock/JIT/consignment terms, minimum releases, inventory title, storage, obsolescence and service-level remedy.

Public timing is not a committed lead. Ask for calendar days for design, prototype, tooling, proof approval, material procurement, production queue, manufacture, pack/inspection, origin delivery, export, main carriage, customs, final delivery and receiving. Identify which activities overlap and provide the critical path, capacity reservation, expedite option and recovery plan. This resolves the current first-party spread: local Ecko says 2–3 weeks custom; EcoEnclose says days for unbranded but weeks for branded; Fantastapack pages conflict; PackMojo adds an international leg; noissue states roughly 10–12 weeks; BOOX custom requires an ongoing volume/contract.

```text
AvailableToUseDate =
  maximum of all prerequisite completion paths
  + production and release
  + physical transport/customs paths
  + receiving/quarantine/release
  + approved risk buffer
```

### Logistics and performance schedule

1. Exact origin and ship-from, service/mode, lead and quote to the named ODM/filler or Southern California 3PL; no generic “landed” label.
2. Master case/pallet/container pattern, cube and gross weight; domestic freight class/NMFC basis where applicable; export pallet/wood requirements.
3. Product-specific test proposal mapping each measured route hazard to method, current revision, level/conditioning, sample, acceptance and laboratory.
4. Production-equivalent sample route and evidence that sample material/process/site/tool equals the proposed production configuration.
5. Pack-line work instructions, timed assembly/pack trial, inspection points, reject/rework, ergonomics and equipment/service needs.
6. Change notification/approval, lot traceability, retains, incoming/release certificate, complaint investigation, corrective action and periodic surveillance.

### Sustainability and compliance schedule

1. Exact component grams and complete BOM, including tapes, labels, films, adhesives, coatings and inks.
2. PCR and eligible pre-consumer fraction by component and whole-package weight, calculation, chain of custody, time/site and certificate/transaction claim.
3. Fiber-certification code/scope/status and transaction claim; do not accept a generic logo.
4. Manufacturing loss, energy/water data or product footprint/EPD with boundary, geography, year, allocation, recycled-content method and assurance.
5. Ordinary end-of-life access, sort/reprocess testing and actual-rate evidence for the exact assembled item; required disassembly and residue assumptions.
6. Toxics-in-packaging and other applicable chemical/material declarations tied to exact revision; claim-language restrictions.
7. Flat/nested inbound and packed outbound logistics, damage/replacement, Product loss and disposal/recovery evidence.

### Reusable-system addendum

Require the asset purchase/rental/service schedule; who owns every asset; serial/QR data rights; monthly minimum; replenishment; forecast/fleet sizing; return options and geographic coverage; carrier contracts; customer incentive; achieved cohort return curve; missing/damaged fee; inspection grades; cleaning/drying/sanitation/repair SOP and validation; refurbishment-node addresses; rejected-asset handling; exact asset and inner-protection BOM; end-of-life recycler/yield; privacy and data retention; transition/termination and unreturned inventory. Ask for raw anonymized cohort totals sufficient to reproduce rotations, not a percentage without denominator/time window.

## Gate-first comparison and shortlist

No public candidate is qualified or ranked. The inherited comparison weights apply only after candidates pass the same hard gates and reach at least common E3 evidence:

| Objective | Weight | Tertiary/DTC implementation |
|---|---:|---|
| Landed cost | 45% | P3 for upstream inventory plus separate P4 by basket/zone; cash, consumed economics, labor, DIM, damage and reuse loop all explicit |
| Technical/performance risk | 20% | Exact test margin, process capability, traceability, change control, field damage and recovery plan |
| Sustainability | 15% | Exact evidence-adjusted score; safety/quality/compliance remains a gate |
| Supplier reliability and lead time | 10% | Nominated site/capacity, critical-path lead, local recovery, JIT/service, on-time/quality evidence |
| Aesthetic fidelity | 10% | Print/color/scuff/unboxing against controlled standard without weakening transport function |

Missing evidence stays unknown/not qualified; it does not receive an average value. Cost is not counted again inside sustainability, and known damage cost is not also penalized as an unbounded risk unless the distinction is documented.

### Recommended first RFQ wave

| Workstream | Common baseline | First cohort | Control / alternate | Advance condition |
|---|---|---|---|---|
| Upstream master cases/dividers | MC-1 local RSC + corrugated cells/pads; same-SKU 12/24 hypotheses | Ecko, Acorn/McKinley, PCA Los Angeles | Crown or Ernest integrated; Uline stock cash control | Common delivered P3, exact manufacturer/site, sample and case/pallet test plan |
| Molded-fiber restraint | MC-2 cavity set for Mini/Full serum and cream | Pacific Pulp | Sonoco or Smurfit Westrock paper-based alternate | Tooling/MOQ/lead, surface and moisture results, production-equivalent transit pass |
| DTC corrugated | DTC-1 plain/one-color right-sized outer + die-cut insert | EcoEnclose, Fantastapack, one Digital Room storefront | Arka; local Ecko/Acorn counterquote | Same dimensions/board/print/insert/quantity/delivery ZIP and P4 reconstruction |
| Adaptive paper protection | DTC-3 measured paper grams/order | Ranpak, Pregis, Storopack | Manual stock paper control | Timed pack study, consumable/equipment/service quote, glass no-contact and route pass |
| Engineered glass restraint | DTC-4 suspension/retention | Sealed Air Korrvu | Best corrugated/molded-fiber prototype | Smaller P4 cube or lower failure/labor sufficient to offset material/tooling complexity |
| Unit load | 48 × 40 expendable pallet + manual containment | Local corrugated/integrator quote | CHEP for recoverable domestic lane; Signode lab/system | Receiver accepts ownership/path; exact containment and 3B/3E route performance |
| Reusable DTC | Qualified one-way pack remains fallback | BOOX bounded opt-in/cohort pilot | EcoEnclose/LimeLoop economics; Returnity for closed-loop B2B | Complete fee/route/SOP/data contract and achieved cost/environment break-even |

### Explicit non-finalists for the launch decision

- **Packsize equipment purchase:** keep as a 3PL capability question; current production/order throughput is too undefined to support owned automation **[SI]**.
- **Foam-in-place:** keep as a glass-damage exception only; do not prototype unless fiber/corrugated/suspension tracks fail the cost-performance boundary **[SI]**.
- **PackMojo/noissue:** retain as offshore/multi-hub landed-cost controls; do not use a component price to bypass origin, long lead, import cube and qualification evidence **[SI]**.
- **RePack/Movopack:** retain as European reuse benchmarks, not Southern California finalists without a current U.S. node and offer **[SI]**.
- **Reusable flexible mailers for glass:** do not treat the outer as protection; a qualified rigid inner can erase the promised simplicity and must be costed/tested **[SI]**.

## Open evidence register

The following unknowns prevent an award:

1. Approved external dimensions, filled mass, decoration and retail-carton decision for all six Product Variants.
2. Real order-basket, zone, carrier/service, return and seasonal forecast for P4.
3. Final case counts, outer dimensions/weights, pallet patterns, stack/receiver limits and pack-line locations.
4. Exact supplier legal/manufacturing identity and subcontractors for every nominated component.
5. Common E3 quotes at derived 1,000/2,000/3,000 production scenarios, including tooling, delivery, tax/duty and overage.
6. Controlled BOM/drawing, PCR/fiber certification, chemical declaration and claim evidence for exact items.
7. Production-equivalent pack labor, material consumption, damage and test results.
8. 3PL storage, receiving, packaging-equipment, labor and carrier-rate terms at the named Southern California site.
9. BOOX and alternative reusable all-in fee, achieved return/loss/condition curve, cleaning/repair evidence, exact nodes, reverse charge and inventory-float requirement.
10. Counsel/compliance approval for final California obligations and every consumer-facing disposal, recycled-content, fiber or reuse claim.

## Final recommendation

The cheapest credible launch path is **not yet a named supplier**. It is a competition architecture:

1. Freeze production-intent primary/secondary dimensions and filled weights.
2. Derive the six same-SKU master-case demands and the actual DTC basket formats.
3. Bid MC-1 and DTC-1 locally/nationally on a common E3 basis, while prototyping MC-2/DTC-2 and DTC-3/DTC-4 for glass.
4. Test the exact pack by route; measure pack labor, cube, DIM, pallet use and failure cost.
5. Rank only passing offers at 45/20/15/10/10 and preserve P3 versus P4.
6. Launch with the lowest risk-adjusted one-way system that passes; run BOOX separately as a reversible, instrumented pilot.

This sequence gives local Southern California converters a fair delivered-cost advantage without assuming they are cheapest, makes national/offshore challengers absorb their real freight and lead, and lets engineered protection win only when its labor/DIM/damage benefit exceeds its added price. It also prevents a familiar beauty customer, a low public unit price, a material label or a theoretical reuse count from becoming unsupported procurement or environmental proof.

All URLs were freshly inspected or rechecked for this report on 2026-08-31. Supplier content is time-sensitive and must be captured again with the RFQ; carrier rules, regulatory status, certificates, prices, products and availability must be verified at decision and launch.
