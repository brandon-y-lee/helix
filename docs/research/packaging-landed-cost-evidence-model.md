# Packaging landed-cost and evidence model

**Research ticket:** [Define the landed-cost and evidence model](https://github.com/brandon-y-lee/helix/issues/248)

**Decision date:** 30 August 2026

**Decision status:** research recommendation for comparing packaging candidates; not a supplier award, customs classification, accounting policy, production quotation, or purchase authorization

**Market and destination:** United States direct-to-consumer; fulfillment-ready goods delivered to a named Southern California receiving point

**Planning quantities:** 1,000, 2,000, and 3,000 saleable finished units per Product, split between Mini and Full Size Product Variants

> This is a procurement decision model, not customs, tax, accounting, or legal advice. A licensed customs broker or CBP ruling must confirm classification and entry treatment; qualified finance, regulatory, and packaging specialists must confirm their respective inputs. Rates and rules are time-sensitive and must be refreshed at the checkpoints defined below.

## Executive decision

helix should not compare supplier unit prices. It should compare a **gated, evidence-qualified cost stack** whose principal measure is:

> **Fulfillment-ready landed cash cost per saleable unit at the named Southern California receiving point.**

The U.S. Department of Commerce describes landed cost as the original product price plus insurance, freight, tariffs, taxes, and other fees; this model extends that official starting point through packaging-specific MOQ, yield, conversion, storage, and parcel consequences ([International Trade Administration landed-cost guidance](https://www.trade.gov/determine-total-export-price)).

Every candidate must be reconstructed to the same physical specification, quantity scenario, Mini/Full mix, currency date, Incoterms® rule and named place, quality yield, logistics route, and evidence tier. The model then reports five views rather than collapsing unlike costs into one deceptively precise number:

1. **Quoted component price** for traceability only; never a winner metric.
2. **Landed empty-pack cost at the fill site**, including primary, secondary, inbound freight, import charges, inspection, and receiving.
3. **Filled-and-packed conversion cost**, adding Formula filling, assembly, changeovers, normal validated loss, and release testing.
4. **Fulfillment-ready landed cost in Southern California**, the common supplier-comparison endpoint.
5. **DTC delivered-cost effect**, a separate order-level view that adds mailer/protection, pick-and-pack, billable parcel weight, carrier charges, damage, and returns.

For each view, show both:

- **first-run cash cost per saleable unit**, which charges the scenario with all cash that must be committed, including MOQ surplus and tooling; and
- **consumed economic cost per saleable unit**, which values only units consumed by the run plus documented storage, carrying, and obsolescence effects for credible reusable surplus.

Never credit surplus at full value unless an approved forecast, unchanged specification, shelf/storage life, and committed reuse horizon support that treatment. Cash exposure, surplus units, and months of coverage remain visible even when economic cost recognizes future use.

Quality and compatibility are hard gates. Only passing candidates may enter the weighted comparison already set for this effort: landed cost 45%, technical/performance risk 20%, sustainability 15%, supplier reliability and lead time 10%, and aesthetic fidelity 10%. A low price cannot compensate for a failed gate.

The immediate consequence is important: **no public listing, marketplace price, or incomplete supplier assertion can establish the cheapest qualified supplier.** That conclusion requires at least comparable written indicative offers; procurement selection later requires production offers tied to approved specifications, fill site, testing responsibilities, and logistics.

## 1. Decision boundary and vocabulary

### 1.1 Unit of comparison

The denominator is a **saleable Product Variant unit received and accepted at the named Southern California destination**. “Saleable” means it has passed the agreed component, fill, assembly, appearance, leakage, labeling, and release criteria. Samples, retains, destructive-test units, rejects, transit damage, and unfilled surplus do not enter the denominator.

The model evaluates six Product Variants—Mini and Full Size for each of Biotic Reset, Peptide Bounce, and Ceramide Cushion—but the formulation run constraint belongs to the Product. Therefore:

```text
Product saleable target = Mini saleable target + Full Size saleable target
```

Packaging-component MOQs remain Variant- and component-specific unless the exact same undecorated component is contractually pooled across Variants. A common color name, nominal neck size, or visual resemblance does not establish interchangeability.

### 1.2 Cost layers

| Layer | Endpoint | Include | Do not silently include |
|---|---|---|---|
| **P0 — supplier quote** | Supplier's stated handoff point | Precisely what the written quote says | Assumed closure, decoration, freight, duty, or quality services |
| **P1 — landed empty packaging** | Named ODM or domestic fill site | Complete component BOM, secondary pack, tooling allocation, inspection, freight, import, receiving | Formula, fill, finished-goods freight |
| **P2 — conversion complete** | Released finished units at fill site | P1 plus filling, assembly, changeover, process loss, release, final packout | Finished-goods freight to Southern California unless the fill site is that destination |
| **P3 — fulfillment-ready Southern California** | Named 3PL/warehouse receiving dock | P2 plus finished-goods freight, transport packaging, customs if applicable, receiving | Customer-order parcel shipping |
| **P4 — DTC delivered** | Customer delivery scenario | P3 inventory value plus pick-and-pack, DTC package, carrier billable weight, accessorials, damage, reshipment, returns | Product price, marketing acquisition cost, or unrelated overhead |

**P3 is the primary comparison metric.** P4 is reported separately because carrier contracts, zones, and basket composition are order facts, while the package's weight, dimensions, fragility, and protection requirement are design consequences.

### 1.3 Management model, not financial statements

This model is designed to choose among suppliers and routes. It must not be presented as GAAP inventory valuation or a tax position. It deliberately exposes cash timing, surplus risk, and avoidable design-driven parcel cost that financial-statement allocations may treat differently.

## 2. Evidence ladder and comparability gate

Every quantitative input receives an evidence class. A higher class does not make a value permanent; it makes its provenance and permitted use clearer.

| Class | Evidence | Permitted use |
|---|---|---|
| **E0 — planning assumption** | Explicit analyst range with owner, rationale, and expiry | Sensitivity only; never represent it as a supplier fact |
| **E1 — public evidence** | Current official catalog, rate schedule, regulation, tariff schedule, or supplier-published price/specification | Market framing and provisional ranges; not a supplier award |
| **E2 — supplier assertion** | Email, form response, capability deck, or conversation not containing a complete comparable offer | Capability screening and diligence questions |
| **E3 — comparable indicative offer** | Dated written offer tied to a defined drawing/specification, quantities, BOM, finish, currency, Incoterms rule and named place, MOQ, tooling, lead time, payment terms, validity, and material exclusions | Indicative ranking and finalist selection |
| **E4 — production offer** | Written offer tied to approved drawings or golden sample, final decoration, selected Formula/fill site, agreed testing and loss responsibilities, production quantities, route, and commercial terms | Procurement recommendation, subject to final approvals |
| **E5 — actual** | Purchase order, commercial invoice, freight/customs entry, receiving, yield, defect, storage, and carrier invoice data | Post-run variance and model calibration |

### 2.1 Critical-field rule

A candidate is **not comparable** if any cost-critical field is absent and cannot be bounded from an independent source. Missing values are never zero. At minimum, the following must be known or explicitly ranged:

- supplier legal entity, actual manufacturing site, and manufacturer-versus-distributor status;
- exact component BOM and what “unit” includes;
- drawing/revision, material, component weight, capacity, neck/closure, color, finish, and decoration passes;
- quantity by Variant, MOQ, order increment, permissible under/overrun, and packaging of components;
- tooling, plates/screens, proofs, samples, testing, ownership, maintenance, storage, useful shot life, and repeat-order treatment;
- currency, quote date, payment schedule, quote expiry, taxes, and bank/payment fees;
- complete Incoterms rule, version, named place/port, and included/excluded logistics services;
- country of origin, proposed classification, packout, master-carton dimensions/weight, and palletization;
- production and transit lead times, capacity reservation, warranty/replacement terms, defect treatment, and inspection responsibility;
- Formula fill/assembly setup, changeover, minimums, expected yield basis, retained/sampled units, and disposition of excess Formula and components.

“FOB,” “DDP,” or “landed” without the named place, rule version, and exclusions is incomplete. ICC explains that Incoterms® 2020 allocates costs, risks, and obligations across eleven rules and reserves CIF for maritime trade; its official contents likewise separate FAS, FOB, CFR, and CIF as sea/inland-waterway rules ([ICC Incoterms® 2020](https://iccwbo.org/business-solutions/incoterms-rules/incoterms-2020/)). Store the complete term—for example, `FCA [exact facility], Incoterms® 2020`—then rebuild every offer to P3.

### 2.2 Evidence register

Every material input receives a source ID and these fields:

```text
source_id
claim_or_value
source_class
publisher_or_counterparty
public_url_or_private_record_id
document_title_and_revision
publication_or_quote_date
accessed_date
effective_date_and_expiry
currency_and_unit
geography_and_route
specification_or_drawing_revision
included_and_excluded_scope
lower_base_upper_value
confidence
owner
next_validation_event
```

Public reports may cite public URLs and sanitized aggregate conclusions. Supplier identities tied to confidential quotations, personal contact details, negotiated terms, private files, and NDAs stay in the approved private workspace. A private record should be referenced by a nonrevealing ID and cryptographic hash or immutable system identifier, not copied into GitHub.

## 3. Scenario matrix

### 3.1 Required quantity scenarios

Run the model independently for each Product at:

- 1,000 total saleable finished units;
- 2,000 total saleable finished units; and
- 3,000 total saleable finished units.

Until demand research approves one Mini/Full forecast, use a configurable mix and publish at least three stress cases rather than calling one a forecast:

- Mini-light: 10% Mini / 90% Full Size;
- trial-forward: 25% Mini / 75% Full Size; and
- balanced stress: 50% Mini / 50% Full Size.

These are sensitivity probes, not recommended launch allocations. Replace or supplement them when an approved demand forecast exists. Never average the three quantity tiers or mix cases into a fictitious “expected” unit cost.

### 3.2 Required route scenarios

Keep at least these routes distinct:

1. ODM stock packaging and filling abroad;
2. ODM-managed custom packaging and filling abroad;
3. helix-nominated components consigned to an ODM abroad;
4. bulk Formula imported and filled/assembled domestically; and
5. a domestic packaging/filling combination if offered.

Each route gets its own leg ledger, importer-of-record treatment, customs value, loss points, cash schedule, and P3 destination. Do not compare an empty component delivered to a port with a filled Product delivered duty paid to a warehouse.

### 3.3 Time and currency freeze

Each model run declares:

- analysis date and base currency (USD);
- quote dates and expiries;
- expected order, ship, entry, and receipt dates;
- exchange-rate source and date;
- tariff/fee schedule revision and lookup date;
- freight rate validity and fuel/peak surcharge effective dates; and
- stewardship rule/fee version.

The Federal Reserve's H.10 program publishes downloadable daily bilateral exchange rates and records corrections, making it a suitable reproducible **analysis-date reference rate** ([Federal Reserve H.10 data](https://www.federalreserve.gov/datadownload/choose.aspx?rel=h10)). It is not necessarily helix's bank settlement rate or the customs conversion rate. Store three separate rates when relevant: analysis reference, actual/contracted payment conversion, and the broker/CBP entry conversion. Show the bank spread and transfer fees rather than hiding them in unit price.

## 4. Quantity, yield, and surplus mathematics

### 4.1 Saleable target and process starts

For Product `p`, Variant `v`, and scenario `s`:

```text
SaleableTarget[p,s] = 1,000 or 2,000 or 3,000
VariantTarget[p,v,s] = SaleableTarget[p,s] × VariantMix[p,v,s]
```

Round Variant targets by a declared rule and force their sum back to the Product target.

Add non-saleable requirements explicitly:

```text
NonSaleable[v] = retains + destructive tests + approval samples + channel samples
RequiredGoodOutput[v] = VariantTarget[v] + NonSaleable[v]
RequiredFillStarts[v] = ceiling(
  RequiredGoodOutput[v] /
  (FillYield[v] × AssemblyYield[v] × FinalReleaseYield[v])
)
```

Use multiplicative stage yields so the same loss is not counted twice. Each yield must identify whether it is a supplier guarantee, comparable-lot actual, pilot result, or E0 range. Until validated history exists, show lower/base/upper cases.

### 4.2 Component requirements

For component `c`:

```text
GrossComponentNeed[c] =
  sum over Variants(BOMQuantity[c,v] × RequiredFillStarts[v])
  + component-only samples
  + destructive incoming-inspection units

OrderQuantity[c] = round_up_to_order_increment(
  max(MOQ[c], GrossComponentNeed[c] + EvidenceBasedSpareQuantity[c])
)
```

Do not use an AQL number as an expected defect rate. ISO 2859-1:2026 defines AQL-indexed lot acceptance sampling and switching rules; it does not establish the expected number of defective components helix will consume ([ISO 2859-1:2026](https://www.iso.org/standard/85464.html)). Expected defects require actual comparable-lot data, a contractual supplier rate, or an explicit E0 sensitivity range.

### 4.3 Four quantities that must never be conflated

For every component and finished Variant, report:

- **ordered** units and cash paid;
- **accepted** units after incoming inspection;
- **consumed** units including process and test use; and
- **saleable** finished units in the denominator.

Then calculate:

```text
UsableSurplus[c] = Accepted[c] - Consumed[c]
RejectedOrLost[c] = Ordered[c] - Accepted[c] + ProcessLoss[c]
```

Rejected units that the supplier replaces at no cost still create inspection, schedule, freight, and possible fill-line costs; recognize recoveries only when the contract and timing support them.

### 4.4 Cash view versus consumption view

```text
FirstRunCashCostPerSaleableUnit =
  TotalScenarioCashOutlay / SaleableUnitsAcceptedAtP3

ConsumedEconomicCostPerSaleableUnit =
  (ConsumedRecurringCost
   + AllocatedOneTimeCost
   + StorageAndCarryingCost
   + ExpectedObsolescenceCost
   + OtherP3Costs)
  / SaleableUnitsAcceptedAtP3
```

Also report `SurplusCashExposure`, `SurplusUnits`, `MonthsOfCoverage`, and the date by which reuse must occur. If reuse is not supported by an approved horizon, charge the current scenario with the full surplus cash cost for ranking and show any salvage separately.

#### Illustrative MOQ effect

This example is arithmetic only, not a quote. A 1,000-unit Product run split 25% Mini and 75% Full Size uses 250 Mini and 750 Full primary packs. If the Mini pack has a 3,000-unit MOQ at $0.65 and the Full pack has a 1,000-unit MOQ at $0.82:

| View | Calculation | Result |
|---|---:|---:|
| Primary-pack cash committed | `3,000 × $0.65 + 1,000 × $0.82` | $2,770.00 |
| First-run cash per saleable unit | `$2,770 / 1,000` | **$2.77** |
| Consumed component value | `250 × $0.65 + 750 × $0.82` | $777.50 |
| Consumed value per saleable unit | `$777.50 / 1,000` | **$0.7775** |
| Surplus cash exposure | `2,750 × $0.65 + 250 × $0.82` | **$1,992.50** |

Reporting only $0.7775 would hide almost $2,000 of required first-run cash and the obsolescence risk of 3,000 surplus components.

## 5. Cost taxonomy

Every cost line has an owner, physical driver, layer, currency, timing, tax treatment, evidence class, and inclusion flag. The following is the minimum complete scope.

### 5.1 Primary package BOM

- container body, bottle, jar, or tube;
- closure, cap, collar, bulb, pipette, wiper, liner, inner disc, seal, and applicator where applicable;
- resin/color masterbatch, glass color, frosting/coating, metallization/anodization, and other finishes;
- decoration passes, labels, inks, varnish, hot stamp, registration, and curing;
- assembly of subcomponents;
- individual bags/trays and supplier master-carton packout;
- component samples, proofs, color standards, golden samples, and compatibility sets.

Require suppliers to price components separately even when they also show an assembled-system total. That reveals omitted closures, mismatched MOQs, and cross-supplier assembly costs.

### 5.2 Secondary package

- unit carton, label, tamper evidence, seal, insert, leaflet, and protective fitment;
- board/material, caliper, coatings, print colors/passes, foil/emboss/deboss, die cutting, gluing, and serialization/lot coding implications;
- plates, dies, proofs, spoilage, setup, packing, and Variant changeovers.

Include a no-carton configuration only if regulatory, protection, tamper, merchandising, and brand gates permit it. “No carton” still requires the complete label/tamper/protection cost.

### 5.3 Tertiary, inbound, and DTC packaging

- master cases, partitions/dividers, trays, void fill, tape, case labels, pallet, slip sheets, corner boards, stretch wrap, and pallet labels;
- export treatment or documentation where applicable;
- DTC mailer, protective insert, dunnage, tape, shipping label stock, and customer insert;
- disposal or return cost for a reusable shipper;
- transport-development samples and laboratory testing.

ASTM's current packaging catalog distinguishes system-distribution testing from single-parcel testing and lists D4169-23e1 for shipping systems and D7386-25 for single-parcel delivery, alongside current drop, vibration, compression, leakage, and conditioning methods ([ASTM packaging standards](https://store.astm.org/products-services/standards-and-publications/standards/paper-standards-and-packaging-standards.html)). Budget the route-appropriate protocol, samples, freight to the lab, retest, and redesign reserve; do not treat successful component inspection as proof of parcel survival.

### 5.4 One-time and semi-fixed costs

- molds, inserts, trim tools, crimp tooling, assembly fixtures, filling parts, and line qualification;
- artwork adaptation, prepress, plates, screens, dies, color matching, and proofs;
- engineering, drawings, sample development, compatibility sets, pilot line time, inspections, audits, and testing;
- onboarding, quality agreements, tooling storage/maintenance, and tooling transfer or disposal.

Show one-time costs in three views:

1. full first-run cash burden;
2. amortization over the approved first-year demand horizon; and
3. technical tool-life view, clearly labeled and never used as the forecast unless demand supports it.

If no approved forecast exists, amortize independently over each 1,000/2,000/3,000 scenario and show the unamortized cash separately. Record who owns the tool, where it resides, guaranteed shot life, maintenance, exclusivity, replacement responsibility, and whether transfer is practical.

For a custom option with one-time cost `Tcustom`, recurring cost `Vcustom`, and a stock option `Tstock`, `Vstock`, the simple pre-yield break-even is:

```text
BreakEvenUnits = (Tcustom - Tstock) / (Vstock - Vcustom)
```

Use only when `Vstock > Vcustom`, then adjust both paths for their actual yields, MOQ surplus, freight, and cash timing. A break-even beyond the approved demand horizon is not a saving.

### 5.5 Filling and assembly

- bulk receipt, sampling, quarantine, storage, warming/mixing/deaeration if required, and disposition;
- line setup, cleaning, changeover, minimum run fee, per-unit fill, torque/crimp, induction/seal, coding, labeling, cartoning, and case packing;
- Formula and component overage, start-up loss, line rejects, retain/sample units, quality release, rework, and destruction/return;
- outside-component receiving, inspection, storage, compatibility responsibility, and line-speed penalty;
- finished-goods palletization, release storage, and outbound handling.

Formula value lost during filling belongs in the route comparison even if this packaging report does not choose the Formula. Keep it as an explicit input per mL or batch rather than assuming zero.

### 5.6 Quality failure and recovery

Include the expected, evidence-supported cost of ordinary incoming defects, fill/assembly rejects, leakage, breakage, and transit damage in P3/P4. Keep catastrophic supplier-performance risk in the separate technical/reliability score unless a defensible probability and loss value exist; otherwise monetizing it and scoring it again would double count uncertainty.

Track recoveries as separate positive lines with timing and confidence. A credit promised after a failed lot does not erase emergency freight, missed launch time, testing, sorting, or destroyed Formula.

### 5.7 Storage, working capital, and obsolescence

Report cash events by date: tooling deposit, sample payment, production deposit, balance before shipment, freight, duty, receiving, filler invoices, storage, and carrier payment. Use helix's approved annual funding rate when available:

```text
CarryingCost = CashTiedUp × AnnualFundingRate × DaysOutstanding / 365
```

Apply this only to the applicable time interval and do not also apply a full net-present-value adjustment to the same cash flow. If no approved rate exists, show a sensitivity table rather than selecting one silently.

For surplus, include storage by pallet/bin/case and month, handling, cycle counts, insurance if separately charged, specification-change risk, artwork obsolescence, component shelf/storage limits, and disposal/salvage. Undecorated shared stock may have more credible reuse than printed Variant-specific stock, but that difference requires documented interchangeability.

### 5.8 Stewardship and nonrecoverable taxes

California SB 54 establishes EPR for covered packaging across sectors; permanent regulations became effective on 1 May 2026, and CalRecycle publishes covered-material categories and producer guidance ([CalRecycle SB 54 program](https://calrecycle.ca.gov/packaging/packaging-epr/)). The cost model must therefore carry, by component, material category and mass, producer-responsibility registration/reporting costs and applicable fees once authoritative schedules and helix's producer status are confirmed.

An unpublished, unapproved, or inapplicable fee is not zero. Mark it `unpriced compliance exposure`, retain material mass/category data, and run a bounded scenario when a credible basis exists. Keep the mandatory cash fee in the cost stack and the packaging attribute in the separate sustainability score; do not count the same fee twice.

Treat sales/use tax, VAT, and similar amounts according to whether helix actually bears or recovers them. Do not treat a recoverable tax as economic cost or omit a nonrecoverable tax.

## 6. International trade normalization

### 6.1 Classification and origin are candidate-specific

Do not hard-code one duty rate for “cosmetic packaging.” Empty glass containers, plastic tubes, metal tubes, closures, droppers, decorated components, sets, bulk Formula, and filled cosmetics may classify differently. Record, for every imported line:

- detailed description and material;
- proposed HTSUS classification and rationale;
- country of origin, not merely ship-from country;
- customs value basis;
- ordinary duty, special-program/FTA treatment, additional duties, and exclusions;
- antidumping/countervailing-duty screening;
- expected entry date and HTS revision; and
- broker confirmation or binding-ruling status.

USITC publishes the current Harmonized Tariff Schedule and successive revisions ([USITC Harmonized Tariff Information](https://www.usitc.gov/harmonized_tariff_information)); USTR maintains the official China Section 301 action and exclusion record ([USTR China tariff actions](https://ustr.gov/issue-areas/enforcement/section-301-investigations/tariff-actions)). Because tariff actions and exclusions can change between quotation and entry, save the exact HTS revision and official action source used, then refresh at production quote, booking, and entry. CBP explains that classification and valuation are the importer's reasonable-care responsibility, even when a broker prepares the entry ([CBP, *Importing into the United States*](https://www.cbp.gov/sites/default/files/documents/Importing%20into%20the%20U.S.pdf)).

If material facts leave classification genuinely uncertain and the exposure could change the winner, seek a CBP binding ruling rather than selecting the cheapest assumed code. CBP's ruling program can address prospective classification or appraised value, although duty rates themselves may later change ([CBP Binding Ruling Program](https://www.help.cbp.gov/s/article/Article-1106?language=en_US)).

### 6.2 Customs value is not necessarily the supplier invoice subtotal

CBP states that transaction value generally begins with the price paid or payable and can require additions for packing, selling commissions, assists, royalties, production costs, and certain proceeds; foreign-currency values must be converted for entry ([CBP commercial-invoice value guidance](https://www.help.cbp.gov/s/article/Article-1162?language=en_US)). Buyer-funded molds, artwork/tooling, or components supplied to an overseas producer may therefore affect customs valuation as assists. Store a separate `customs_value` calculation by entry line; do not simply apply duty to P3 cost or assume freight is dutiable.

### 6.3 Government fees and entry costs

Keep these separate from duty:

- merchandise processing fee;
- harbor maintenance fee when applicable;
- customs bond;
- broker/entry and line fees;
- security filing and documentation;
- exams, inspection, storage, demurrage/detention, and port/terminal charges;
- courier advancement/disbursement fees; and
- drayage and destination delivery.

For reference, CBP's fiscal-year 2026 formal-entry MPF guidance states 0.3464% of merchandise value, with a $33.58 minimum and $651.50 maximum; its HMF guidance states 0.125% of commercial cargo value for applicable waterborne port use and no HMF for air imports ([CBP MPF](https://www.help.cbp.gov/s/article/Article-1128?language=en_US), [CBP HMF](https://www.help.cbp.gov/s/article/Article-1105?language=en_US)). These values are evidence for the dated 2026 model, not permanent constants. Store rates in an effective-dated table and refresh for the expected entry date.

### 6.4 Incoterm reconstruction

For each offer, create a leg-by-leg responsibility matrix:

| Leg/cost | Seller included? | helix incurred? | Evidence | Cash date | P3 allocation driver |
|---|---:|---:|---|---|---|
| Export packing and supplier pickup |  |  |  |  | physical driver |
| Origin handling/export clearance |  |  |  |  | shipment/line |
| Main carriage and fuel/security charges |  |  |  |  | chargeable weight or volume |
| Cargo insurance |  |  |  |  | insured value |
| Destination terminal/handling |  |  |  |  | shipment/line |
| Duty, MPF, HMF, bond, broker |  |  |  |  | customs value or entry driver |
| Drayage/final delivery |  |  |  |  | pallet, weight, or volume |
| Receiving and discrepancy handling |  |  |  |  | cases/units/time |

Even for DDP, request an itemization and importer-of-record identity. An embedded amount may be commercially convenient, but it is not analytically comparable if duty classification, freight service, delivery point, or recoverable tax is opaque.

## 7. Freight, warehousing, and parcel economics

### 7.1 Inbound and finished-goods freight

Use contemporaneous forwarder/carrier quotations for the exact route and packout. A public per-kilogram or per-container rate is E1 context, not a comparable offer. Record:

- origin/destination postal code or port and named facility;
- mode and service level;
- cartons/pallets, actual weight, dimensions, cubic volume, stackability, and chargeable weight;
- consolidation, minimum charge, pickup, origin/destination handling, fuel/security/peak surcharges, insurance, and accessorials;
- transit-time range, free time, rate validity, and excluded disruption charges; and
- whether the freight quote covers empty components, bulk Formula, or filled finished goods.

Allocate shared main carriage by its physical billing driver—chargeable weight, cubic volume, pallets, or carrier-rated units. Allocate customs duties by entry-line customs value/rate, not by unit count. Allocate per-entry broker costs by a declared causal rule and show the total; allocation changes Product economics, not total cash.

### 7.2 Southern California receiving and storage

Quote and model appointment, pallet/carton receiving, unload, count/inspection, discrepancy photos, labeling/rework, system onboarding, bin/pallet storage, minimum monthly fees, handling, and outbound case movement. A “landed” supplier offer ending curbside is not P3 if helix still pays appointment, liftgate, pallet exchange, receiving, or exception fees.

### 7.3 DTC package-driven cost

Measure the final sealed mailer at its extreme points and obtain actual packed weight. UPS explains that dimensional weight is cubic size divided by the applicable divisor and may apply to domestic and international packages; its current U.S. guidance lists divisor 139 for Daily Rates and 166 for Retail Rates ([UPS package dimensions and weight](https://www.ups.com/us/en/support/shipping-support/shipping-dimensions-weight)). Contracted rules may differ, so store the carrier, contract/rate-card version, effective date, rounding, divisor, zone, and service.

```text
DimensionalWeight = rounded_outer_length × rounded_outer_width × rounded_outer_height / carrier_divisor
BillableWeight = carrier_rule(max(actual_weight, dimensional_weight))
```

Do not use one national “shipping cost.” Evaluate at least:

- one Mini, one Full Size, and the likely Core bundle;
- representative zone distribution from the actual or approved forecast;
- contracted base rate and applicable fuel, residential, delivery-area, peak/demand, additional-handling, address-correction, and other accessorials;
- pick-and-pack, label, mailer/protection, damage, reshipment, and return handling.

USPS's Domestic Mail Manual is effective-dated and classifies mail by size, weight, content, service, and other factors, so USPS scenarios must likewise cite the exact DMM/rate version rather than reuse a UPS divisor or rule ([USPS Domestic Mail Manual](https://pe.usps.com/TEXT/DMM300/welcome.htm)).

Report both total P4 cost and the **package-driven delta** against the lowest-volume compliant design. The delta isolates whether heavy glass, excess headspace, a large closure, or decorative secondary packaging pushes the shipment into a higher billable weight or surcharge threshold.

### 7.4 Damage and transport validation

Until representative, Formula-filled, fully decorated packages pass the route-appropriate protocol, report damage/breakage as a range and label it provisional. Testing cost belongs in one-time development; observed steady-state damage, protective material, reshipment, and customer-service cost belong in P4. Do not offset damage cost with a supplier warranty unless that warranty covers the same losses and timing.

## 8. Uncertainty, scoring, and decision rules

### 8.1 Uncertainty is structured data

Every nonfixed material input has lower/base/upper values, evidence class, reason, and expiry. At minimum, sensitivity covers:

- 1,000/2,000/3,000 Product volume;
- Mini/Full mix;
- component MOQ and order tolerance;
- tooling horizon;
- component, fill, assembly, and final-release yield;
- freight mode/rate and fuel/peak charges;
- exchange rate and bank spread;
- HTS classification/duty/additional-duty scenarios where unresolved;
- storage duration, approved funding rate, and surplus reuse;
- breakage/damage and parcel-zone/basket mix; and
- stewardship fee exposure.

Use deterministic scenario tables first. Monte Carlo analysis is optional and must not invent probability distributions where only guesses exist.

### 8.2 No false precision

Round operational quantities according to actual order rules, currency totals to cents, and summary per-unit costs to a practical precision while retaining calculation precision internally. Display uncertainty ranges and evidence class beside the result. If two candidates' credible ranges overlap materially, call the result **indeterminate pending evidence**, not a fractional-cent winner.

### 8.3 Cost score

After hard gates and the comparability gate pass, calculate a scenario-specific cost index:

```text
CostScore[candidate,scenario] =
  100 × LowestQualifiedP3Cost[scenario] / CandidateP3Cost[scenario]
```

Cap at 100. Then apply the approved 45% weight. Publish alongside it:

- P3 dollars per saleable unit;
- difference from lowest qualified option in dollars and percent;
- first-run cash commitment;
- surplus cash exposure;
- cheapest-option frequency across declared scenarios;
- worst credible premium to the scenario winner; and
- evidence class/completeness.

The final weighted score does not override a gate. It also must avoid double counting:

- normal evidence-supported defect consumption may enter cost; systemic quality risk remains in technical/reliability;
- mandatory EPR cash fees enter cost; environmental attributes enter sustainability;
- ordinary quoted lead-time carrying cost may enter cash timing; disruption risk remains reliability unless independently monetized.

### 8.4 Winner rules

A candidate may be described as:

- **lowest public reference price** only within an identical public-price scope;
- **lowest comparable indicative P3 cost** only with E3 evidence and passed gates;
- **recommended for production** only with E4 evidence, required final-container testing, approved Formula/fill site, and the full cross-functional decision; or
- **actual lowest cost** only after E5 reconciliation.

Every winner statement names the scenario, layer, evidence class, date, and exclusions. “Cheapest supplier” without these qualifiers is prohibited.

## 9. Workbook and data contract

The later cost workbook should implement this report as normalized tables, not as six bespoke supplier tabs with incompatible formulas.

### 9.1 Required tables

| Table | Grain | Essential fields |
|---|---|---|
| `scenarios` | one Product-volume-mix-route case | scenario ID, Product, total target, Variant mix, route, destination, analysis date |
| `variants` | one Variant in a scenario | nominal fill, saleable target, non-saleable units, stage yields, required starts |
| `components` | one BOM component/revision | supplier-private ID, factory country, material, mass, drawing, shared status, MOQ, increment |
| `quotes` | one component/service/quantity break | evidence class, quantity, unit, currency, date, validity, Incoterm/named place, included scope |
| `one_time_costs` | one tooling/setup/test item | cash amount/date, ownership, useful life, allocation horizon, recovery |
| `orders_and_yield` | one component/Variant/scenario | need, MOQ, ordered, accepted, consumed, lost, surplus |
| `logistics_legs` | one shipment leg | origin, destination, mode, dates, dimensions, weight/volume, chargeable basis, all-in/exclusions |
| `customs_lines` | one entry line | HTS, origin, value, duty programs/actions, MPF/HMF allocation, broker/ruling status |
| `cash_flows` | one payment event | due date, currency, reference/actual FX, amount, funding days/rate |
| `storage` | one stock pool/month | location, cases/pallets/bins, rate, handling, coverage, expiry/obsolescence status |
| `parcel_cases` | one basket/carrier/zone/service | outer dimensions, actual/DIM/billable weight, rate card, accessorials, damage/reshipment |
| `evidence` | one source/value | complete evidence-register fields from section 2.2 |
| `outputs` | one candidate/scenario/layer | cash/economic cost, per-unit cost, range, completeness, score, surplus, rank stability |

### 9.2 Calculation controls

Automated checks must fail when:

- Mini plus Full Size does not equal the Product target;
- ordered quantity is below required quantity, MOQ, or order increment;
- accepted, consumed, surplus, and loss quantities do not reconcile;
- P0 through P3 layers do not reconcile to their detailed costs;
- a cost is both supplier-included and added again;
- currency/date/unit is absent;
- a critical field is blank or zero without an explicit zero-cost source;
- shared components have different drawings, materials, colors, decorations, or revisions;
- a quote is expired at the decision date;
- a public or supplier-assertion value is ranked as E3/E4;
- a duty/tariff rate lacks origin, HTS revision, effective date, and source; or
- a P4 carrier result lacks final outer dimensions, actual weight, rate card, zone/service, and effective date.

Maintain an append-only change log for source-value replacements. Keep formulas protected, input cells identifiable, units explicit, and the analysis reproducible from the evidence register.

## 10. Comparable RFQ and quote intake

The later RFQ should provide one common specification pack and request a machine-readable price schedule. At minimum, require:

1. exact quoted legal entity, manufacturing factory, country of origin, and subcontractors;
2. drawing/spec revision and itemized component BOM;
3. material, weight, dimensions/capacity, finish, decoration, tolerances, and included assembly;
4. prices at the exact Variant quantities and useful adjacent breaks;
5. MOQ, order increment, under/overrun, shared-component pooling rules, and repeat-order terms;
6. every mold, tool, plate, screen, die, proof, sample, testing, setup, and changeover cost;
7. currency, payment schedule, taxes, quote validity, and bank fees;
8. complete Incoterms rule/version/named place plus optional FCA and delivered alternatives;
9. master-carton count, dimensions, gross/net weight, palletization, and production/transport lead times;
10. quality plan, defect/replacement terms, inspection access, traceability, and change notification;
11. tooling ownership, location, life, maintenance, transfer, exclusivity, and replacement;
12. HS/HTS suggestion clearly labeled nonbinding, origin support, and FTA documentation where claimed;
13. filler-specific minimums, outside-component fees, expected loss basis, retained/test units, Formula disposition, and responsibility matrix; and
14. explicit exclusions and assumptions.

Ask finalists to quote the same quantity/mix scenarios and physical specification. If a supplier proposes an alternate construction, give it a separate candidate ID and identify every changed performance, appearance, sustainability, and cost assumption; do not overwrite the common baseline.

## 11. Governance and refresh checkpoints

### 11.1 Required refreshes

Refresh all time-sensitive inputs:

- when indicative offers are compared;
- when the final Formula, dimensions, decoration, fill site, and packout are fixed;
- immediately before a production recommendation;
- at freight booking;
- at customs entry; and
- after first receipt and after the first meaningful DTC shipment cohort.

At each refresh, preserve the prior model run and explain changes rather than overwriting history.

### 11.2 Actual-cost reconciliation

After a run, reconcile E4 to E5 by line:

```text
purchase-price variance
exchange-rate and bank-fee variance
tooling/setup variance
freight and accessorial variance
customs/duty/fee variance
component acceptance variance
fill/assembly/release yield variance
surplus and storage variance
receiving variance
parcel billable-weight and surcharge variance
damage/reshipment variance
```

Feed observed yields, carton dimensions, actual freight, and damage into later scenarios without erasing the original forecast. Supplier performance that affects reliability scoring should be recorded separately from the cost variance.

## 12. Decision checklist

Before calling any option the lowest-cost qualified packaging route, confirm all of the following:

- [ ] It passes the separate technical, compatibility, quality, and supplier gates.
- [ ] It is at least E3 and meets the critical-field comparability gate.
- [ ] Its exact physical specification and aesthetic alternative are named.
- [ ] P3 ends at the same Southern California receiving point as every comparator.
- [ ] Product quantity and Mini/Full mix are identical across comparators.
- [ ] Ordered, accepted, consumed, surplus, lost, and saleable quantities reconcile.
- [ ] First-run cash, consumed economic cost, surplus exposure, and cash dates are all visible.
- [ ] Incoterm, named place, origin, HTS revision, duties/actions, MPF/HMF, and broker status are explicit.
- [ ] Freight uses the exact packout and a contemporaneous quote.
- [ ] Tooling is shown as cash and under an approved amortization horizon.
- [ ] Storage, working capital, obsolescence, stewardship, and nonrecoverable taxes are not assumed away.
- [ ] P4 uses final packed dimensions, actual weight, contracted rate rules, zones, baskets, accessorials, and damage.
- [ ] Every material number has a source ID, evidence class, effective date, and uncertainty treatment.
- [ ] Rank stability and break-even points are shown; overlapping credible ranges are called indeterminate.
- [ ] No confidential supplier terms or personal data appear in the public artifact.

## Conclusion

The correct procurement question is not “Who quoted the lowest container price?” It is:

> **Which qualified system produces the lowest evidence-supported P3 cash and economic cost per accepted saleable Variant, at the declared Product volume and Mini/Full mix, while remaining robust to MOQ surplus, route, tariff, freight, yield, storage, and parcel-cube uncertainty?**

This model makes that question auditable. It also makes uncertainty honest: current public prices and supplier assertions can build the range, comparable indicative offers can identify finalists, and only production offers plus final-container evidence can support procurement. Until those gates are met, the disciplined answer is a conditional cost range—not a prematurely named “cheapest” supplier.
