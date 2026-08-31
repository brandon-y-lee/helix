# Packaging-to-ODM versus domestic-filler route comparison

**Decision status:** planning evidence, not a sourcing award

**Research date:** 2026-08-31

**Analysis currency:** USD; no exchange-rate conversion is applied because no comparable supplier offers are present

**Scope:** cleanser, serum, and moisturizer; 1,000, 2,000, and 3,000 finished units per Product, divided between Mini and Full Product Variants

**Delivery boundary:** accepted, fulfillment-ready units at a Southern California receiving dock; the exact named facility and address are **[U]**

**Related work:** [landed-cost evidence model](./packaging-landed-cost-evidence-model.md), [quality and compatibility gates](./packaging-quality-compatibility-supplier-gates.md), [sustainability scoring](./packaging-sustainability-scoring.md), and [U.S./California constraints](./us-california-cosmetic-packaging-constraints.md)
**Issue:** [#262](https://github.com/brandon-y-lee/helix/issues/262)

“Packaging” in this report includes the complete primary system and closure, secondary unit packaging, and tertiary master-case/pallet configuration; a quote that omits one layer is not complete.

## Decision in one page

No route is yet eligible to be called the lowest-cost high-quality route. Public evidence establishes credible operating models, but it does not establish a common P3 landed cost, passed exact-pack quality gates, or binding acceptance of every Mini/Full split. The correct next action is a common, line-item RFQ and technical-qualification exercise across all four routes—not a supplier award.

The evidence supports the following **[SI] RFQ-sequencing hypotheses**, not a route ranking:

1. **Test ODM stock packaging first as the cost-control baseline.** It has the fewest commercial interfaces and freight handoffs. It should be quoted first whenever an exact stock system can pass the applicable safety, quality, compatibility, legality, transport, and environmental-claim gates; sustainability then remains a weighted objective. Whether any reviewed ODM will accept one Formula production serving a 1,000–3,000-finished-unit Product run split into two sizes remains unverified.
2. **Test bulk Formula to a domestic filler as the first challenger.** Public Southern California filling services explicitly advertise customer-supplied bulk and packaging, relevant formats, and entry points as low as 1,000 units ([Talara](https://www.talaramarketing.com/bottlefilling), [Natural Cosmetic Labs](https://naturalcosmeticlabs.com/pages/product-filling-services)). That makes the route plausible at helix's planning quantities, not qualified. It introduces a second manufacturing interface, international bulk movement, receiving quarantine, transfer loss, and divided defect responsibility.
3. **Test helix-nominated packaging sent to an ODM as an aesthetic-control exception.** It can unlock a required tube, dropper, or jar that an ODM cannot source, but it adds at least one component supply chain and, when the nominated supplier is outside the ODM country, another import. Receiving/storage, overage, and a potentially difficult liability boundary apply either way. It should advance only with written outside-component acceptance and a route-level advantage after every leg and loss is quoted.
4. **Test ODM-managed custom packaging as a scale or differentiation exception.** Development, sampling, tooling, decoration minimums, and surplus are likely to dominate 1,000–3,000-unit economics unless “custom” is actually a stock mold with decoration or a shared component. No reviewed ODM publishes enough route-specific commercial detail to validate it at these runs.

These are supported inferences, not supplier selections. This report did not select a Formula and did not contact, select, contract, or authorize any ODM, filler, packaging supplier, broker, carrier, laboratory, or importer.

## Evidence and decision rules

Every material statement uses one of four claim classes:

| Tag | Meaning | Permitted decision use |
|---|---|---|
| **[VF] Verified fact** | Law, regulator guidance, official standard metadata, or an independently verifiable public record | May define a gate or a documented input; still verify freshness and applicability |
| **[SA] Supplier assertion** | Any supplier-authored website, catalog, general condition, specification, price, or marketing claim | May create an RFQ/qualification lead; not independent proof of performance or applicability |
| **[SI] Supported inference** | A conclusion derived transparently from cited facts and the established landed-cost model | May guide sequencing and sensitivity analysis; not a quote or qualification result |
| **[U] Unknown** | A decision-critical value absent from current public evidence | Must remain blank, fail a gate, or be requested; never enter the model as zero |

Claim type and source class are orthogonal: a supplier-published claim is **[SA]** and, when public, its cost-model evidence class is E1. Cost evidence follows the established E0–E5 ladder in the [landed-cost evidence model](./packaging-landed-cost-evidence-model.md). A public price is E1 even when it is precise. A route cannot be ranked “cheapest” until its critical commercial inputs reach at least comparable E3 offers and its hard quality/compliance gates pass.

The analysis keeps four boundaries separate:

- **P0:** supplier price at the quoted complete `Incoterms® 2020` rule and exact named place;
- **P1:** complete empty packaging landed at the fill site;
- **P2:** filled, assembled, released finished goods at the fill site; and
- **P3:** accepted, fulfillment-ready units at the Southern California receiving dock.

P4 pick/pack and parcel fulfillment remains a separate cost view rather than part of the P3 denominator. The package-driven P4 delta—dimensions, billable weight, protective material, damage, reshipment, and returns—must still be reported before final route selection. DTC transport packaging, damage/replacement, usable-yield, and end-of-life inputs also remain inside the established sustainability functional boundary. First-run cash and consumed economic cost are shown separately because tooling, master-carton minimums, packaging surplus, and unused bulk can materially change cash required without being consumed in the first saleable run.

## Planning quantities and the split-minimum problem

The Product-level Formula quantity is not automatically the filler-, packaging-, decoration-, carton-, or SKU-level minimum. Each must be quoted independently.

| Product run | Mini / Full mix | Mini units | Full units | Finished units |
|---:|---:|---:|---:|---:|
| 1,000 | 10% / 90% | 100 | 900 | 1,000 |
| 1,000 | 25% / 75% | 250 | 750 | 1,000 |
| 1,000 | 50% / 50% | 500 | 500 | 1,000 |
| 2,000 | 10% / 90% | 200 | 1,800 | 2,000 |
| 2,000 | 25% / 75% | 500 | 1,500 | 2,000 |
| 2,000 | 50% / 50% | 1,000 | 1,000 | 2,000 |
| 3,000 | 10% / 90% | 300 | 2,700 | 3,000 |
| 3,000 | 25% / 75% | 750 | 2,250 | 3,000 |
| 3,000 | 50% / 50% | 1,500 | 1,500 | 3,000 |

The nine rows are approved E0 planning scenarios **per Product**, or 27 Product-specific cases across cleanser, serum, and moisturizer ([Q-01](#quantitative-evidence-register)). They are unit counts, not bulk quantities. **[U]** Target net content by Variant, the legal mass/volume basis, validated Formula density where a conversion is needed, fixed Formula samples/retains, process loss, bulk-vessel working capacity, and order increment must be supplied before Route D mass, vessel count, freight, customs value, or storage can be calculated.

For each row, the RFQ must distinguish:

- one Formula batch minimum and any minimum bulk mass/volume;
- each Mini and Full filling order minimum;
- each primary component and closure minimum;
- decoration minimum per artwork, color, and size;
- secondary carton and insert minimum per artwork;
- master-case minimum and packout;
- line-trial, setup, cleaning, assembly, and changeover minimums; and
- required component and Formula overage.

**[SI]** The 10/90 and 25/75 Mini orders are the stress cases. A provider that advertises a 1,000-unit project minimum may still require 1,000 units per size, fill run, or artwork. Public “small-lot” language does not resolve that distinction.

The E0 package brief carried into every route is:

| Product | Primary-system alternatives that must remain distinct |
|---|---|
| Cleanser | White soft tube in either a heavy, crinkle-retaining architecture or a lighter, shape-recovering architecture; exact cap/seal and Mini/Full dimensions remain open |
| Serum | Frosted glass dropper bottle in dark amber or clear/translucent frost, with a silver-tone collar and black bulb; exact finish, pipette and Mini/Full dimensions remain open |
| Moisturizer | Frosted glass wide-mouth jar with white or black closure; exact liner/seal and Mini/Full dimensions remain open |

An ODM or filler format claim does not collapse these alternatives. Each exact Formula × Product Variant × BOM × decoration × fill line × packout × route configuration must qualify separately.

## The four route definitions

### Route A — ODM stock packaging

The ODM selects an existing package system, sources it through its approved network, and fills, assembles, and exports finished units corresponding to the Mini and Full Product Variants.

```text
approved component suppliers
  → ODM receipt / incoming inspection / storage
  → Formula manufacture
  → Mini fill and assembly ↔ size changeover ↔ Full fill and assembly
  → finished-goods release / export packout
  → origin pickup / consolidation / port or airport
  → international freight
  → U.S. entry / broker / FDA-CBP review
  → port or airport handling / drayage
  → Southern California receiving / inspection / acceptance
```

**Benefit [SI]:** fewest buyer-managed interfaces, no separate buyer-controlled component import into the ODM country, and one accountable finished-goods manufacturing counterparty.

**Cost/risk [SI]:** restricted component choice, possible compromise against the required aesthetic, opaque embedded packaging margin, and no public proof of either size-split acceptance or total P3 cost.

**Decision gate [U]:** exact stock package, bill of materials, country of origin, MOQ by size/artwork, decoration method, surplus ownership, passed samples, and complete P3 quote.

### Route B — ODM-managed custom packaging

The ODM manages development of a new or materially modified package, then fills and exports finished goods.

```text
brief / industrial design / engineering
  → mold or tooling path / samples / decoration proofs
  → component qualification and production
  → ODM receipt / inspection / storage
  → Formula manufacture / Mini and Full filling / assembly
  → finished-goods release
  → the same finished-goods export, U.S. entry, and Southern California legs as Route A
```

**Benefit [SI]:** one ODM-managed development interface and better potential alignment between package engineering and the ODM fill line.

**Cost/risk [SI]:** design, tooling, sampling, validation, decoration setup, component production minimums, unused stock, and a longer critical path can overwhelm small finished-unit runs.

**Decision gate [U]:** identify whether each proposal is new tooling, stock tooling with custom decoration, a catalog package combination, or a shared component. Those options cannot be costed as one category.

### Route C — helix-nominated packaging sent to an ODM

The team nominates one or more packaging suppliers. Components reach the overseas ODM as buyer-supplied/free-issue materials; the ODM manufactures Formula, fills, assembles, and exports finished goods.

```text
nominated primary / closure / secondary suppliers
  → decoration and component assembly, if separate
  → origin inspection and export packout
  → domestic or international component freight to the ODM
  → ODM-country import entry / broker / duty-tax handling when cross-border
  → ODM receipt / quarantine / inspection / storage
  → Formula manufacture / Mini and Full filling / assembly
  → finished-goods export
  → U.S. entry / broker / FDA-CBP review
  → Southern California receiving / inspection / acceptance
```

**Benefit [SI]:** maximum control over the white cleanser tube, frosted dropper, or frosted jar when the ODM catalog is inadequate; pricing transparency can improve when components are quoted directly.

**Cost/risk [SI]:** a supplier outside the ODM country creates an additional cross-border movement; a same-country supplier creates only its domestic supplier-to-ODM leg. Both cases add component damage/delay exposure before filling, ODM storage, excess-component requirements, line incompatibility, and split responsibility for defects. Buyer-provided components incorporated into imported merchandise can also raise U.S. customs valuation questions as “assists”; CBP's official importing guide treats certain buyer-supplied materials incorporated into imported goods as additions to transaction value, subject to the governing valuation rules ([CBP Importing into the United States](https://www.cbp.gov/sites/default/files/documents/Importing%20into%20the%20U.S.pdf)).

**Decision gate [U]:** written ODM acceptance, exact delivery term, importer-of-record path into the ODM country, testing and overage, line-trial result, scrap ownership, storage fees, defect remedies, and U.S. customs valuation treatment.

### Route D — bulk Formula imported and filled domestically

The ODM makes and releases bulk Formula. Bulk crosses the U.S. border, a domestic filler receives and transfers it, separately supplied packaging arrives at that filler, and finished goods move domestically to Southern California.

```text
ODM Formula manufacture / bulk release
  → qualified bulk vessel / closure / seal / export packout
  → origin pickup / port or airport
  → international bulk freight
  → U.S. entry / broker / FDA-CBP review
  → domestic filler receipt / quarantine / inspection / storage
  → bulk conditioning and transfer

primary / closure / secondary suppliers
  → decoration / assembly / inspection
  → freight and any import entry to domestic filler

bulk + components
  → Mini fill / assembly ↔ cleaning-changeover ↔ Full fill / assembly
  → finished-goods testing / release / master-case packout
  → domestic freight
  → Southern California receiving / inspection / acceptance
```

**Benefit [SI]:** domestic finished-goods control, a potentially shorter final leg, public evidence of fillers working at relevant quantities, and the ability to nominate the exact package without importing empty components into an overseas ODM.

**Cost/risk [SI]:** an additional regulated processing facility and quality agreement; bulk vessel, transport, quarantine, conditioning, transfer, heel and line loss; multiple inbound component legs; and a defect boundary spanning ODM, carrier, filler, and packaging suppliers. Imported bulk remains subject to the same U.S. cosmetic admissibility requirements as domestic product ([FDA, Importing Cosmetics](https://www.fda.gov/industry/importing-fda-regulated-products/importing-cosmetics)).

**Decision gate [U]:** final Formula transport classification, bulk vessel and hold-time specification, filler acceptance, validated transfer/fill process, Formula quantity conversion into both sizes, complete yield reconciliation, and route-level P3 quote.

## First-party capability evidence

### ODM operating-model leads

The entries below establish credible business models only. They are not a shortlist or a finding that the provider accepts the target Product, package, price, or split.

| Provider | First-party evidence | Relevant route signal | What remains unknown |
|---|---|---|---|
| COSMAX | **[SA]** COSMAX describes ODM work spanning brand strategy, formulation, package, design, manufacturing, and a global material/packaging network ([ODM](https://www.cosmax.com/en/what-we-do/original-development-manufacturing/), [global supply chain](https://www.cosmax.com/en/manufacturing/global-supply-chain/)). | Routes A and B are within the advertised model. | Numeric Formula, fill, size, component, and decoration minimums; stock package match; outside-component acceptance; bulk-export terms; all prices. |
| Kolmar Korea | **[SA]** Kolmar describes total service through manufacturing and logistics, a package-development center, “Ready-Made (Package Combination)” inquiries, and facilities for small-quantity batches through mass production ([company](https://www.kolmar.co.kr/eng/about/summary.php), [package center](https://www.kolmar.co.kr/eng/rd/researcher.php), [business inquiry](https://www.kolmar.co.kr/eng/businessinfo/busi_inquiry.php), [business areas](https://www.kolmar.co.kr/eng/businessguide/busi_area.php)). | Routes A and B; the ready-made inquiry path is particularly relevant to a stock baseline. | What “small quantity” means; Mini/Full split; outside components; bulk export; commercial terms. |
| Cosmecca Korea | **[SA]** Cosmecca advertises turnkey OGM/ODM service, raw and subsidiary-material warehousing, production and delivery, varied filling/packaging equipment, and a multi-product small-lot system ([OGM system](https://www.cosmecca-esg.com/OGMSYSTEM), [manufacturing system](https://www.cosmecca-esg.com/Manufacturing_system)). | Routes A and B; multiple formats and small-lot positioning warrant an RFQ. | Numeric minimum by Product/SKU; stock aesthetic match; outside-component and bulk-export terms. |
| Cosmecca EOGM | **[SA]** Its online catalog combines formulas, package design, production, release, and shipping ([EOGM](https://www.en.e3ogm.com/)). One specific catalog eye-patch listing states 5,000 MOQ and 60–90 days after artwork ([specific listing](https://en.e3ogm.com/TP1/?bmode=view&idx=170083823); [Q-03](#quantitative-evidence-register)). | A catalog model can simplify Route A. The specific listing demonstrates that “small-lot” does not prove 1,000–3,000 fit. | The cited 5,000 figure applies only to that listing and must not be generalized to cleanser, serum, or moisturizer. |
| BKOLOR Makeup & Skincare | **[SA]** Published, unexecuted General Conditions of Sale contemplate buyer-supplied/free-issue materials when acceptance appears in the commercial offer; the document assigns conformity/certification responsibility to the buyer, requires separately agreed additional tests, states 5% packaging overage, uses DDP delivery to the factory at buyer cost, and extends delivery for buyer-material delay ([Givaudan/BKOLOR general conditions](https://www.bkolormakeup.com/SalesConditions/GIV_GCS_EN.pdf); [Q-09](#quantitative-evidence-register)). | Evidence that this supplier publishes a possible outside-component structure and that Route C responsibility must be written, not assumed. | The conditions are not an executed customer contract, do not prove performed capability, are not an industry norm, and do not establish that any reviewed ODM accepts buyer-nominated components. |

Cosmecca's website also advertises 3–4 weeks for an existing product and 6–7 weeks for a new product. **[SA]** Those figures are a supplier assertion, not an end-to-end lead time to Southern California and not a commitment for the six Product Variants ([manufacturing system](https://www.cosmecca-esg.com/Manufacturing_system); [Q-02](#quantitative-evidence-register)).

### Domestic filling leads

| Provider / location | First-party scope and public minimum | Route-D relevance | Qualification gaps |
|---|---|---|---|
| Talara Marketing, Santa Ana, California | **[SA]** Accepts customer packaging and bulk; lists creams, gels, lotions, cleansers, plastic tubes, glass bottles, glass jars, plastic jars, and airless formats; states MOQ starts at 1,000 and filling starts at $1.50/unit plus $100 cleaning and $100 setup on its disclosed round-bottle configuration ([filling](https://www.talaramarketing.com/bottlefilling), [location](https://www.talaramarketing.com/contact-us); [Q-04](#quantitative-evidence-register)). | Direct public alignment for cleanser and moisturizer forms, relevant formats, a target-tier entry point, and the Southern California endpoint. | Facial serum; minimum per project, Formula, size, or line; fee recurrence; non-round-bottle scope; overage and loss; tube-seal capability; exact equipment; testing; registrations/certifications; quote validity; liability. |
| Natural Cosmetic Labs, Placentia, California | **[SA]** Accepts customer-supplied or its own bulk; advertises hair serum, cream, lotion, gel, bottle, jar, dropper and specialty filling; labels/codes/seals/cartons/cases; describes approximate ±1–2% fill tolerance and minimums varying from 500–2,500 based on size and fill volume ([filling](https://naturalcosmeticlabs.com/pages/product-filling-services), [location](https://naturalcosmeticlabs.com/pages/contact); [Q-05](#quantitative-evidence-register)). Its broader contract page lists tubes among packaging formats ([manufacturing](https://naturalcosmeticlabs.com/pages/contract-manufacturing)). | Public quantity range overlaps the plan; SoCal location reduces the final filled-goods leg. | Facial-serum and exact cleanser-tube acceptance; MOQ for every Product Variant; fill-control evidence versus legal net contents; equipment/neck/closure fit; bulk import handling; all costs; registrations/certifications and quality evidence. |
| Contemporary Cosmetics Group, Newark, New Jersey | **[SA]** States that customers send custom components and bulk, lists thin-to-viscous products including creams and serums, assembly/packaging, manual short-run capability, and jobs from 50 to 25,000 ([contract filling](https://www.contemporarycosmetics.com/contract-filling), [facility](https://www.contemporarycosmetics.com/new-page); [Q-06](#quantitative-evidence-register)). | Strong public evidence for the operating model and small orders; useful geographic counterquote. | Cleanser tubes and exact glass systems; Formula transport/receipt protocol; quality credentials; every fee and freight leg to Southern California. |
| New Look Cosmetics, Chatsworth, California | **[SA]** Advertises skincare contract manufacturing, filling/assembly, compounding/bulk-only service, and a 3,000-unit-and-above minimum ([skincare](https://newlookcosmetics.com/skincare/); [Q-07](#quantitative-evidence-register)). | Potential 3,000-unit California benchmark. | Whether 3,000 is per Product, Formula, SKU, or package; acceptance of imported customer bulk; exact package formats and costs. |
| FIPI / Fill It Pack It, Compton, California | **[SA]** Advertises bottles, jars, tubes and pumps; lotions, creams and gels; secondary packaging; and short or long runs ([capabilities](https://www.fillitpackit.com/)). | Relevant SoCal capability lead. | Customer-supplied imported bulk, numeric retail MOQ, exact package systems, quality gates, and all prices. |
| Purolea, Michigan | **[SA]** Advertises liquid/semi-liquid filling in bottles, jars and airless formats and small/medium lots; its home page states a 1,000-unit MOQ ([packaging and filling](https://www.purolea.com/packaging-filling/), [home page](https://www.purolea.com/); [Q-08](#quantitative-evidence-register)). | Geographic and operating-model counterquote at the lower target tier. | Imported customer-bulk acceptance, tube/dropper specifics, per-size minimum, quality credentials, and all landed legs. |

**[SI]** Talara and Natural Cosmetic Labs are direct public Southern California Route-D leads because their sites align the customer-supplied-bulk model and relevant quantity ranges. Neither page establishes the exact three-Product, two-size scope. That is a reason to request evidence, not to treat marketing or quality claims as verified.

### Quantitative evidence register

This compact public register applies the established E0–E5 evidence contract to every quantitative input currently used. Publication dates and expiry dates are not stated on the supplier pages unless noted; all pages were accessed 2026-08-31. Currency is USD only where shown. The packaging-sourcing workstream owns revalidation; no Legal Operator or procurement counterparty is assigned by this report.

| Source ID | Claim or planning value | Class / publisher / record | Geography, route, scope, and exclusions | Confidence and next validation |
|---|---|---|---|---|
| **Q-01** | 1,000/2,000/3,000 finished units per Product; 10/90, 25/75, 50/50 Mini/Full mixes | **E0** approved planning scenarios; analysis date 2026-08-31; unit = finished units | All Products/routes; excludes fill mass/volume, loss, minimums, and forecast approval | High that these are the requested sensitivities; replace or supplement with approved demand forecast |
| **Q-02** | 3–4 weeks existing product; 6–7 weeks new product | **E1**, Cosmecca [manufacturing page](https://www.cosmecca-esg.com/Manufacturing_system); no currency | Supplier-stated manufacturing context; not P3, not necessarily the exact sites/Variants, no queue/customs/SoCal receipt | Low for route scheduling; obtain an E3 calendar tied to site, configuration, trigger, and route |
| **Q-03** | 5,000 MOQ; 60–90 days after artwork for one eye-patch listing | **E1**, Cosmecca [EOGM listing](https://en.e3ogm.com/TP1/?bmode=view&idx=170083823); unit = listing units/days | One unrelated catalog item; not cleanser, serum, or moisturizer and not a general supplier minimum | High for the narrow page text, none for the Core Products; obtain Product-specific E3 offers |
| **Q-04** | MOQ starts at 1,000; filling starts at $1.50/unit + $100 cleaning + $100 setup | **E1**, Talara [filling page](https://www.talaramarketing.com/bottlefilling); USD | Customer packaging + bulk; disclosed price basis is labeling a round bottle with twist cap/pump and unit carton; no stated expiry; not P2/P3 or a Mini/Full quote | Medium for a public lower bound, low for proposed packages; obtain E3 offer with fee-event count and full scope |
| **Q-05** | Approximate ±1–2% filling tolerance; minimum 500–2,500 depending on package size/fill volume | **E1**, Natural Cosmetic Labs [filling page](https://naturalcosmeticlabs.com/pages/product-filling-services); units/percent | Customer or NCL bulk; haircare/cosmetic formats; facial serum, cleanser tube, exact controls, and per-Variant minimum unresolved | Medium for screening only; obtain E3 per-Variant offer and raw control evidence |
| **Q-06** | Jobs from 50–25,000 | **E1**, Contemporary Cosmetics Group [filling page](https://www.contemporarycosmetics.com/contract-filling); units | Customer bulk/components in Newark; not a guarantee for the exact three Products, packages, or two-size split | Medium for range screening; obtain E3 per-Variant offer |
| **Q-07** | 3,000 units and above | **E1**, New Look Cosmetics [skincare page](https://newlookcosmetics.com/skincare/); units | California service assertion; level of the minimum and imported customer-bulk acceptance unresolved | Medium-low; obtain E3 scope/minimum confirmation |
| **Q-08** | 1,000-unit MOQ | **E1**, Purolea [home page](https://www.purolea.com/); units | Michigan; customer-supplied imported bulk, exact formats, and per-Variant level unresolved | Medium-low; obtain E3 scope/minimum confirmation |
| **Q-09** | 5% buyer-supplied packaging overage in published general conditions | **E1**, BKOLOR/Givaudan [General Conditions of Sale](https://www.bkolormakeup.com/SalesConditions/GIV_GCS_EN.pdf); percent | Applies only if incorporated into an actual commercial offer governed by those terms; not an executed agreement or industry norm | High for document text, none for another ODM; obtain route-specific written acceptance and overage |

Regulatory quantities and thresholds remain cited directly to the controlling official source in the relevant section. An actual model run must extend this register with quote date/expiry, currency/unit, Incoterms® 2020 rule and named place, route, drawing revision, lower/base/upper value, scope, confidence, owner, and next-validation event for every monetary, yield, time, mass, volume, freight, tariff, and stewardship input.

## A public price is not a landed-cost comparison

Talara's advertised price creates one narrow E1 lower-bound anchor ([Q-04](#quantitative-evidence-register)):

```text
single-run published reference floor
  = ($1.50 × units) + $100 cleaning + $100 setup
```

**[SA]** The page says pricing “starts at” those amounts and discloses a labeling basis of a round bottle, twist cap/pump, and unit carton. **[U]** Fee recurrence for Mini plus Full, applicability to tubes/droppers/jars, accepted yield, testing, freight, storage, release, rework, tax, and liability are not published ([Talara filling](https://www.talaramarketing.com/bottlefilling)). The expression is not an equality for the proposed configurations, P2, or P3 and cannot be compared with an ODM finished-goods quote.

The same rule applies to every public price: a tube-filling quote that includes the tube and printing, a bulk-only quote, and a finished ODM quote have different boundaries. Normalize scope before comparing unit prices.

## Landed-cost model by route

The model must preserve Product-, Variant-, component-, and activity-level quantities. A single composite `Qbuy × unit price` is invalid because a component MOQ must not create an equal number of Formula fills, and a fill minimum must not silently purchase every component at the same quantity.

For Product `p`, Variant `v`, component `c`, and one route/scenario:

```text
SaleableTarget[p] = 1,000 or 2,000 or 3,000
VariantTarget[p,v] = SaleableTarget[p] × VariantMix[p,v]

NonSaleable[v]
  = retains + destructive tests + approval samples + channel samples

RequiredGoodOutput[v]
  = VariantTarget[v] + NonSaleable[v]

TechnicalFillStarts[v]
  = ceiling(
      RequiredGoodOutput[v]
      / (FillYield[v] × AssemblyYield[v] × FinalReleaseYield[v])
    )

PhysicalFillStarts[v]
  = if the provider's fill minimum requires physical production:
      round_up_to_fill_increment(
        max(PhysicalFillMOQ[v], TechnicalFillStarts[v])
      )
    otherwise:
      TechnicalFillStarts[v]

BillableFillQuantity[v]
  = round_up_to_billing_increment(
      max(BillableFillMinimum[v], PhysicalFillStarts[v])
    )

GrossComponentNeed[c]
  = Σv(BOMQuantity[c,v] × PhysicalFillStarts[v])
    + component-only samples
    + destructive incoming-inspection units

OrderQuantity[c]
  = round_up_to_order_increment(
      max(MOQ[c], GrossComponentNeed[c] + EvidenceBasedSpareQuantity[c])
    )
```

Each stage yield and every physical/billable MOQ and increment must carry an E0–E5 source; do not use an AQL as an expected defect rate. A minimum-charge-only commitment affects filling cash through `BillableFillQuantity` but must not create Formula/component consumption. A physical-production minimum affects Formula, components, surplus, and filling cash through `PhysicalFillStarts`. If the provider does not distinguish the two, the offer is not comparable. Formula quantities remain Product-level even though filling is Variant-level:

```text
FormulaNetFillNeed[p]
  = Σv(PhysicalFillStarts[v] × ControlledTargetFormulaMassPerUnit[v])

ControlledTargetFormulaMassPerUnit[v]
  = statistically justified target fill mass above the declared net mass,
    when mass is the legal/control basis
  OR statistically justified target fill volume above the declaration
     × validated density at stated conditions

FormulaProcessNeed[p]
  = FormulaNetFillNeed[p]
    + fixed Formula samples/retains
    + line-trial/startup/changeover allowance
    + evidence-based bulk-vessel heel and transfer allowance

FormulaOrderQuantity[p]
  = round_up_to_batch_increment(
      max(FormulaBatchMOQ[p], FormulaProcessNeed[p])
    )

BulkVesselCount[p]
  = ceiling(FormulaOrderQuantity[p] / qualified vessel working capacity)
```

The controlled target is the documented process mean needed to satisfy the declaration under the approved tolerance and acceptance rule; it is not the declared net quantity itself. Record the nominal declaration, target mean, expected giveaway/overfill, tolerance, measurement uncertainty, and acceptance rule separately.

The model must report, for each component, Formula lot, and finished-unit stream corresponding to a Product Variant, **ordered**, **accepted**, **consumed**, and **saleable** quantities separately. It must also report:

```text
UsableSurplus[c] = Accepted[c] - Consumed[c]
RejectedOrLost[c] = Ordered[c] - Accepted[c] + ProcessLoss[c]

P3 first-run cash per accepted saleable unit
  = TotalScenarioCashOutlay / SaleableUnitsAcceptedAtP3

P3 consumed economic cost per accepted saleable unit
  = (ConsumedRecurringCost
     + AllocatedOneTimeCost
     + StorageAndCarryingCost
     + ExpectedObsolescenceCost
     + OtherP3Costs)
    / SaleableUnitsAcceptedAtP3
```

`TotalScenarioCashOutlay` independently sums Formula order cash, every component order, tools/proofs/tests, setup/cleaning/changeover/fill/assembly, every logistics/customs/storage/inspection/release line, stewardship fees, and other route cash. Also display `SurplusCashExposure`, `SurplusUnits`, `MonthsOfCoverage`, and the reuse deadline. Unused conforming components, unfilled bulk, and reusable tooling remain inventory or assets in the consumed view only when an approved forecast, ownership, shelf/storage life, committed reuse horizon, unchanged specification, reuse right, and future compatibility support that treatment. Otherwise charge the current ranking with the full surplus cash and show salvage separately. First-run cash always includes the full outlay.

### Route cost ledger

| Cost family | A: ODM stock | B: ODM custom | C: nominated pack to ODM | D: bulk to domestic filler |
|---|---:|---:|---:|---:|
| Formula manufacture and Formula-level testing | Include | Include | Include | Include |
| Primary, closure, liner/seal, decoration, secondary, master case | ODM quote, itemized | ODM quote, itemized | Direct suppliers plus ODM handling | Direct suppliers plus filler handling |
| Design, engineering, tooling, proof, pilot | Usually limited; verify | Material | Supplier/ODM line trial | Supplier/filler line trial |
| Component freight to fill site | Embedded or itemized | Embedded or itemized | Every supplier/decorator domestic leg and, if cross-border, export/import leg | Every supplier/decorator/import/domestic leg |
| Component import duty/tax/brokerage | Usually embedded at ODM | Usually embedded at ODM | Explicit only when supplier origin differs from ODM country | Explicit into U.S. if imported |
| Receiving, quarantine, inspection, storage | ODM quote | ODM quote | Explicit ODM charge/allowance | Explicit filler charge/allowance |
| Filling, cleaning, setup, size changeover, assembly | ODM quote | ODM quote | ODM quote plus outside-pack fee | Filler quote |
| Component and process overage/loss | ODM guarantee/allowance | ODM guarantee/allowance | Supplier + ODM overage and remedies | Suppliers + filler overage; bulk heel/transfer/fill loss |
| Bulk vessel, conditioning, export/import, transfer | Not separate | Not separate | Not separate | Explicit and material |
| Finished-goods international freight and U.S. import | Explicit | Explicit | Explicit, including assist valuation review | No international finished-goods leg; bulk import replaces it |
| Domestic final freight to SoCal | Port/airport plus drayage/3PL | Same | Same | Filler to SoCal; short if local, long if remote |
| U.S. receiving, inspection, rejection/rework | Include | Include | Include | Include |
| Surplus ownership, disposal, storage, obsolescence | Verify | Likely material | Explicit by component | Explicit for bulk and every component |
| Applicable EPR/stewardship cash fees and unresolved compliance exposure | Include separately | Include separately | Include separately | Include separately |
| Package-driven P4 delta and DTC sustainability inputs | Report separately | Report separately | Report separately | Report separately |

Every blank commercial value is **[U]**, not `$0`.

### Required route-specific line items

**Route A**

```text
Formula + stock primary/closure/secondary/master case
+ stock decoration setup and unit cost
+ Mini setup/fill/assembly + Full setup/fill/assembly + changeover/cleaning
+ ODM QA/release + reject/rework allowance
+ origin handling/export + international finished-goods freight/insurance
+ U.S. broker/duty/fees/exam/storage/demurrage if incurred
+ port/airport handling/drayage/3PL receipt/inspection
+ final movement to the Southern California acceptance dock
```

**Route B** adds design, engineering, tools/molds, color/decor trials, golden samples, pilot components, validation, tool maintenance/storage/ownership, custom-component minimums, surplus, and obsolescence to Route A.

**Route C** adds each nominated supplier/decorator leg and ODM receiving/quarantine/inspection/storage/handling, outside-pack setup or surcharge, excess components, rejected-component return/disposal, and U.S. assist-valuation review to Route A. Add component export, international freight/insurance, and ODM-country customs/brokerage/duty/tax only when the nominated supplier is outside the ODM country.

**Route D** replaces finished-goods international freight with bulk vessel/deposit or disposal, bulk export packout, international bulk freight/insurance, U.S. bulk customs/FDA entry, port/airport and inland delivery to the filler, receipt/quarantine/storage, conditioning/transfer, bulk heel and line loss, filler setup/cleaning/changeover/fill/assembly/release, each packaging inbound leg, and filler-to-SoCal freight.

### Break-even tests

For two routes whose compared configurations have reached **Commercial configuration approved**, with the same P3 boundary and a fixed Mini/Full mix:

```text
Qbreak-even = (Fchallenger − Fbaseline) / (Vbaseline − Vchallenger)
```

Use it only when `Vbaseline > Vchallenger`, both routes pass the same hard gates, accepted yield is normalized, and the quantity does not cross a price, MOQ, freight, or tooling tier. Otherwise compare discrete cash and consumed-cost scenarios at 1,000, 2,000, and 3,000 units.

For Route D versus Route A, calculate the complete delta rather than treating Route-D additions as the whole comparison:

```text
Route-D P3 advantage over Route A
  = [Route-A ODM filling/setup/changeover/assembly avoided
     + Route-A finished-goods export/international freight/U.S. import avoided
     + any evidenced packaging or Formula cost advantage]
    - [Route-D bulk vessel/export/international freight/U.S. import/inland-to-filler
       + Route-D domestic filling/setup/changeover/assembly/release
       + Route-D separately managed packaging legs
       + Route-D incremental QA/storage/conditioning/transfer loss
       + Route-D filler-to-Southern-California freight]

Equivalent check: advantage = P3_A - P3_D
```

**[U]** Every monetary term is unquoted. The equation identifies the quote fields; it does not predict that domestic filling is cheaper.

Do not add a generic “risk,” “coordination,” contingency, or risk-adjustment dollar to P3. Technical/performance risk and supplier reliability/lead time remain separate 20% and 10% objectives. Include an expected-loss cash term only when an independently evidenced probability, loss magnitude, route attribution, time horizon, and non-duplication check support monetization; otherwise show the risk in those weighted objectives and scenario sensitivities.

## Tier and mix effects

| Scenario | Route A | Route B | Route C | Route D |
|---|---|---|---|---|
| 1,000 total, any split | **[SI]** Best structural baseline if the ODM accepts both small size orders. | **[SI]** Highest fixed-cost exposure. | **[SI]** Component freight, overage, and any applicable cross-border costs are least diluted. | **[SA]** Public 1,000-unit entry points exist. **[SI]** Each split order may still fail a per-size minimum. |
| 2,000 total | **[SI]** Better setup/freight dilution; exact tier unknown. | **[SI]** Custom economics remain uncertain without shared tooling or repeat-use plan. | **[SI]** More dilution; a cross-border nominated supplier adds an extra border, while a same-country supplier does not. | **[SI]** A credible comparison tier if both size runs fit equipment and minimums. |
| 3,000 total | **[SI]** Strongest chance of conventional ODM fit, still unverified. | **[SI]** May support decorated stock or modest customization; new tooling still unproven. | **[SI]** Direct sourcing may become more competitive, conditional on component MOQ and loss. | **[SA]** More public domestic providers enter the range. **[SI]** The route remains quality- and bulk-gated. |
| 10/90 Mini/Full | **[SI]** Mini is the likely minimum/changeover stressor. | Same plus custom Mini-component surplus. | Same plus nominated Mini-component MOQ/storage and any applicable import. | Same plus a very small Mini fill/cleaning event. |
| 50/50 Mini/Full | **[SI]** Balanced volumes improve split feasibility. | Better tool/component utilization than 10/90, still quote-dependent. | Better freight and component utilization. | Better fill-run balance, potentially two similar setups. |

## Filling, assembly, and line compatibility

A provider's list of “tubes,” “droppers,” or “jars” is not an exact-line qualification. Each Product Variant requires a completed equipment-fit record.

| System | Compatibility evidence required before route scoring |
|---|---|
| Cleanser tube | Tube construction and recovery/crinkle behavior; diameter/length; wall and barrier structure; shoulder/neck/orifice; cap thread/hinge/torque; nominal/brimful capacity and fill-point method; closure displacement/headspace; fill temperature and viscosity window; bottom seal/crimp type and coding area; fill direction; air control; seal integrity; leak/burst test; line tooling and guides; rate at proposed quantity; decoration rub resistance; master-case orientation. |
| Serum dropper | Bottle dimensions/finish/tolerance; nominal/brimful capacity and measured fill point; closure/pipette displacement and headspace; pipette length/tip clearance; bulb/collar/liner materials; thread fit and application/removal torque; dose and draw; residual/usable content; wiper if any; fill precision; glass breakage controls; leak/inversion/ship tests; frosting/coating durability; line starwheel/chuck/tooling. |
| Moisturizer jar | Jar/neck/finish tolerance; nominal/brimful capacity and measured fill point; closure/liner displacement and headspace; tare and target/usable net content; residual; liner or seal; cap thread/torque; fill temperature/viscosity; stringing and nozzle dive; air entrapment; net-content control; closure/liner compatibility; leak and ship tests; glass handling/breakage; decoration durability; line guides/chucks. |

For Mini and Full, request setup and cleaning time, change parts, rated and demonstrated line speed, startup scrap, normal process scrap, maximum over/under-run, fill-tolerance method, in-process sampling, rework policy, and whether both sizes can come from one released Formula batch.

A supplier's stated fill tolerance alone does not establish U.S. net-contents compliance. FDA requires an accurate declaration while permitting reasonable unavoidable variation under good manufacturing practice ([21 CFR 701.13](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-G/part-701/subpart-B/section-701.13)); the applicable sampling, average, and individual-package controls must be documented for the sale geography. The exact mass/volume basis, target fill, tare, density conversion, measurement method and conditions, allowable headspace, and control limits depend on the final Formula, package, and artwork.

## Packaging and Formula loss

Loss must be quoted as both a planning overage and a reconciled outcome.

| Loss point | A | B | C | D | Required evidence |
|---|:---:|:---:|:---:|:---:|---|
| Component manufacturing/decor rejects | ✓ | ✓ | ✓ | ✓ | ordered, produced, inspected, accepted, rejected, credited quantities by lot |
| Transit damage before fill | ODM-managed | ODM-managed | nominated-component domestic leg and international leg if applicable | each packaging leg | packing method, carrier exceptions, receiving photos/counts, claim owner |
| Incoming-inspection rejects | ✓ | ✓ | high interface importance | high interface importance | AQL/sample plan, defect classes, quarantine/disposition |
| Line trial/startup/changeover scrap | ✓ | ✓ | ✓ | ✓ | units/components and Formula consumed per size/event |
| Bulk-vessel heel / transfer loss | — | — | — | ✓ | shipped/received/transferred/returned/disposed mass balance |
| Fill giveaway and net-content rejects | ✓ | ✓ | ✓ | ✓ | target, tolerance, check-weigh data, reject/rework count |
| Closure/assembly/label/carton rejects | ✓ | ✓ | ✓ | ✓ | stage-level yield and defect codes |
| Release-test failure / quarantine | ✓ | ✓ | ✓ | ✓ | lot status, investigation, rework/destruction, liability |
| Finished-transit damage | ✓ | ✓ | ✓ | domestic leg | case/pallet spec, damage count, claim and replacement terms |

BKOLOR's published general conditions state 5% extra buyer-supplied packaging when those conditions and the free-issue arrangement apply. **[SA]** This shows a published supplier term, not an executed relationship, performed capability, or universal 5% assumption ([general conditions](https://www.bkolormakeup.com/SalesConditions/GIV_GCS_EN.pdf); [Q-09](#quantitative-evidence-register)). Each actual offer must state required overage by component and whether unused conforming units are returned, stored, destroyed, or retained.

## Transport classification and Route-D bulk control

Every route requires a documented transport-classification decision for finished units corresponding to each Product Variant, mode, route, and packout before route choice. Routes A–C move filled Formula internationally; Route D moves bulk internationally and finished units domestically. Route D therefore needs separate bulk and finished-unit determinations. Do not assume either bulk or filled Formula is non-hazardous. Retain the evidence, classifier, date, SDS/revision, composition basis, mode, quantity/package limits, and reclassification triggers required by the [U.S./California constraints](./us-california-cosmetic-packaging-constraints.md).

Route D also cannot be costed until the final Formula, shipment mode, vessel, working quantity, and classification establish the bulk transport conditions.

The bulk specification must define:

- vessel type and nominal/working capacity (for example lined drum, pail, or IBC), food/cosmetic-contact suitability, prior-use restriction, liner, closure, gasket, tamper seal, seal number, headspace, and palletization;
- cleaning/sanitization evidence, fill/closure procedure, vessel tare and net weight, batch/lot identity, sampling port, and retained samples;
- storage and transport temperature/light/orientation limits, allowable excursions, data logger, agitation or conditioning, maximum hold time, freeze/heat sensitivity, and release after excursion;
- SDS, transport classification, COA, batch release, microbial/physical/chemical specification, country of origin, invoice/packing list, and chain of custody;
- responsibility and risk transfer at every complete `Incoterms® 2020` rule and exact named place, spill response, cargo insurance, damage/temperature claim process, and security seal reconciliation;
- receiving quarantine, vessel inspection, sample/testing plan, disposition authority, storage charges/free days, and maximum wait before fill;
- transfer equipment, hoses, pumps, filters/screens, sanitation, line clearance, temperature/viscosity conditioning, heel measurement, flush/recovery/rework policy, wastewater/disposal, and reusable-vessel return; and
- mass balance: ODM net released, carrier net, filler net received, net transferred, fill giveaway, filled packages, retained/rework/disposed bulk, and remaining usable bulk.

**[VF]** U.S. hazardous-material packaging must be compatible with its contents, closed to prevent release, and able to withstand normal transport; air shipment adds mode-specific conditions ([49 CFR 173.24](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.24), [173.24a](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.24a), [173.27](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.27)). Applicability and exact packaging depend on the classified Formula and mode.

## Customs, brokerage, and regulatory interfaces

### Rules common to U.S. imports

- **[VF]** Imported cosmetics must comply with the same U.S. legal requirements as domestic cosmetics. Entry data identify the manufacturer, importer, and product; inaccurate or incomplete data can cause manual review ([FDA, Importing Cosmetics](https://www.fda.gov/industry/importing-fda-regulated-products/importing-cosmetics), [FDA import process](https://www.fda.gov/industry/import-program-food-and-drug-administration-fda/fda-import-process)).
- **[VF]** Each nonexempt cosmetic manufacturing or processing facility must have the required facility registration. Ordinarily the owner/operator submits; for an eligible contract-manufacturing facility, the Responsible Person may submit under the statutory mechanism, in which case the owner/operator does not submit a duplicate registration. The label-defined Responsible Person separately has the product-listing duty and related Responsible Person obligations. A domestic filler and a foreign contract manufacturer can each create a facility role; product filling is not merely “packaging” for this purpose. Registration is not FDA approval or certification ([FDA registration and listing](https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products), [FDA final guidance](https://www.fda.gov/media/170732/download), [21 U.S.C. § 364c](https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title21-section364c)). Apply any submission path or exemption only after role-, facility-, and Product-specific review.
- **[VF]** CBP transaction value can require additions beyond invoice price, including specified packing, selling commissions, assists, royalties/license fees, or proceeds ([CBP valuation](https://www.help.cbp.gov/s/article/Article-1162?language=en_US)). The named Importer of Record retains reasonable-care responsibility for classification, valuation, origin, entry accuracy, duties, taxes, and fees even when a customs broker files as its agent; paying a broker does not relieve the importer of liability ([CBP importer/exporter tips](https://www.cbp.gov/trade/basic-import-export/importer-exporter-tips), [19 CFR 141.1](https://www.ecfr.gov/current/title-19/chapter-I/part-141/subpart-A/section-141.1)). A carrier is a separate role, and Incoterms® allocation does not replace the statutory Importer of Record.
- **[U]** Duty, additional duty, Merchandise Processing Fee, Harbor Maintenance Fee where applicable, bond, broker, exam, storage, demurrage, detention, and drayage differ for empty packaging, bulk Formula, and finished cosmetics. No route may use a generic zero-duty assumption.

### Route C: components entering the ODM country

When a nominated component crosses into Korea for a Korea-based ODM, the flow needs a Korean importer, HS classification, origin/value, commercial invoice, packing list, transport document, customs/broker terms, duty/tax funding, complete Incoterms® 2020 rule and named place, and disposition of rejected or unused components. Korea Customs Service provides the official tariff database and states that commercial imports require value and classification declarations with applicable duty/internal taxes ([tariff database](https://www.customs.go.kr/english/ad/ct/CustomsTariffList.do), [tax payment](https://www.customs.go.kr/english/cm/cntnts/cntntsView.do?cntntsId=2736&mi=8060)). A Korean component supplier delivering to a Korean ODM has a domestic leg instead and must not be charged this import ledger.

**[VF]** Korean duty drawback may be available for qualifying imported raw materials used in exported goods, but it requires documentation and calculation. **[SI]** Do not assume eligibility or that an ODM passes any recovery to the buyer's Legal Operator; request the contractual treatment ([Korea Customs Service, drawback](https://www.customs.go.kr/english/cm/cntnts/cntntsView.do?cntntsId=2746&mi=8056)).

When finished units corresponding to Product Variants enter the United States, the named Importer of Record, with broker/counsel input as appropriate, must assess whether buyer-paid free-issue components or tools are customs assists and how their value is apportioned. **[U]** The route model needs the written determination, not a zero-value placeholder.

### Route D: bulk entering the United States

Bulk Formula requires its own HTS classification, origin/value, FDA product/manufacturer/importer entry data, invoice, packing list, transport document, customs bond/brokerage, and any required SDS/transport documentation. FDA describes a limited ingredient-labeling exemption for bulk cosmetics moving to an establishment for repacking or labeling when the conditions and written agreement in 21 CFR 701.9 are met. **[VF]** That is a conditional labeling mechanism, not a general exemption from cosmetics law or import review ([FDA, Cosmetics Importers](https://www.fda.gov/cosmetics/cosmetics-international-activities/cosmetics-importers)).

The quality/regulatory agreement must identify each facility owner/operator and foreign U.S. agent where applicable, the label-defined Responsible Person, the Importer of Record for each imported flow, the California SB 54 Producer determination, serious-adverse-event contacts, records, complaint investigation, safety substantiation, label control, and change notification. Legal duties cannot be erased by assigning them to a purchase-order line.

## Storage, receiving, inspection, and release

The quote must state for every receiving location:

- delivery appointment rules, unload/pallet fees, free storage days, daily/weekly storage rates, minimum billing, lot segregation, temperature/light controls, and insurance;
- receiving count/weight, external damage, seal check, lot/COA reconciliation, sampling plan, test responsibility, quarantine status, release authority, and notification deadline;
- nonconformance categories and evidence, rejected-material segregation, return freight, reinspection, sorting/rework, destruction, replacement, credit, and schedule recovery;
- inventory title/risk, cycle counts, shelf life/retest, slow-moving or surplus disposition, and access/audit rights; and
- finished-goods acceptance at the Southern California dock, including quantity, lot documents, release status, damage, label/carton correctness, and the time window for latent versus visible defects.

FDA's cosmetic GMP inspection checklist expects clean and identified bulk containers and transfer/filling equipment, approved materials, samples and testing after transfer/filling, status/lot identification, and controlled packaging storage and handling. **[VF]** It is useful as a control checklist, not proof that a provider follows it ([FDA GMP checklist](https://www.fda.gov/cosmetics/cosmetics-guidance-documents/good-manufacturing-practice-gmp-guidelinesinspection-checklist-cosmetics)).

## Quality, compatibility, and ownership

All four routes must pass the same release ladder in the [quality and compatibility gates](./packaging-quality-compatibility-supplier-gates.md). Moving fill location is a configuration change: the exact Formula, package system, fill/transfer equipment, process, decoration, secondary pack, and ship configuration require evidence for the proposed route.

### Provisional responsibility map

`A` means accountable, `R` performs, `C` must participate, and `U` means the exact named party is unresolved. Statutory roles below follow the cited public rules; commercial assignments remain subject to executed agreements.

| Activity | Accountable party | Performing / consulted parties | Unresolved decision |
|---|---|---|---|
| Formula specification and ODM manufacturing/bulk release | Formula ODM `A/R` for its manufacturing release | filler and authorized quality representative `C` | buyer acceptance criteria and remedies `U` |
| Component specification and conformance | buyer's Legal Operator or authorized quality representative `A`; packaging supplier `R` for manufacture | proposed filler `C/R` for incoming inspection | exact legal entity, tests, and remedy `U` |
| Package-Formula compatibility protocol | buyer's authorized quality representative `A` | Formula ODM, package supplier, and proposed filler `R/C` by protocol | laboratories, acceptance, and cost `U` |
| Exact-line trial and process controls | proposed fill facility `A/R` for its process | Formula ODM, package supplier, authorized quality representative `C` | trial scope, yield guarantee, and remedy `U` |
| Bulk vessel/export release (D) | Formula ODM `A/R` for filled vessel release | vessel supplier and carrier `C`; Importer of Record `C` | classification, term, risk, and loss allocation `U` |
| Bulk receipt/quarantine/transfer (D) | domestic filler `A/R` for receipt and process | Formula ODM, carrier, authorized quality representative `C` | disposition and mass-balance remedy `U` |
| Manufacturing batch release | overseas ODM/filler `A/R` for A–C; domestic filler `A/R` for D | authorized quality representative `C` | release record and deviation rights `U` |
| Lot disposition and Southern California acceptance | buyer's Legal Operator acting through its authorized quality representative `A` | manufacturer/filler and receiving site `R/C` | exact Legal Operator, delegate, and acceptance window `U` |
| Facility registration | one permitted submitter per nonexempt facility: owner/operator by default, or Responsible Person for an eligible contract-manufacturing submission `A/R` | foreign U.S. agent and non-submitting facility party `C`; no duplicate filing | submission path, exemption, and named facility/site `U` |
| Product listing, safety substantiation, serious-adverse-event duties, and label control | label-defined Responsible Person `A/R` | ODM/filler/package suppliers `C` for records | exact Responsible Person `U` |
| Import classification/value/origin/entry/duties | named Importer of Record `A` | licensed customs broker `R` as agent; suppliers/carrier `C` | IOR by shipment and assist treatment `U` |
| Contractual freight task/cost/risk | party named by complete Incoterms® 2020 rule and named place `A/R` | carrier/forwarder `R`; broker and IOR separately | term, place, exclusions, insurance `U` |
| California SB 54 producer duties and stewardship cash | statutorily determined Producer `A/R` | Legal Operator, suppliers, compliance counsel `C` | exact Producer and fees `U` |

This is a negotiation and role-separation checklist, not a legal conclusion. Incoterms® can allocate contractual tasks and costs but cannot reassign statutory roles.

### Defect-liability matrix

| Failure | Evidence needed to assign cause | Contract questions |
|---|---|---|
| Component out of drawing/spec before fill | approved drawing/golden sample, lot records, incoming sample plan, measurements/photos | Who inspects, by when, at whose cost; credit versus replacement; freight/sorting/expedite; Formula/slot losses caused by late components? |
| Component passes incoming but fails line | trial record, setup parameters, failure mode, component tolerance distribution, line condition | Is the component, supplier specification, ODM/filler equipment, or setup causal; who owns trial and production scrap? |
| Formula/package incompatibility | approved protocol, retains, stability/compatibility data, change history, failure analysis | Which party designed/approved protocol; remedies for components, Formula, filled stock, testing, recall, and delay? |
| Fill-weight, seal, closure, label, carton defect | batch record, in-process data, torque/seal checks, defect samples, equipment status | Rework/repack rights, charge, release authority, yield guarantee, latent-defect period? |
| Bulk contamination, excursion, or loss (D) | ODM release sample, vessel/seal record, logger, receiving sample, chain of custody, mass balance | Risk transfer; carrier/filler/ODM investigation; testing; rejected-bulk storage/disposal; replacement and lost packaging/slot? |
| Transit damage | ship configuration, pre-shipment inspection, carrier condition reports, receiving evidence | Complete Incoterms® 2020 rule/named place, risk, cargo claim owner, insurance, replacement lead time, consequential-cost limits? |
| Decoration or consumer-use failure | approved artwork/proof, adhesion/rub tests, retains, complaint samples | Warranty scope, test method, acceptance level, refund/rework/recall allocation? |

Purchase price credit alone may not cover lost Formula, line time, tests, freight, disposal, launch delay, or customer remedies. **[U]** Each agreement must state direct remedies, exclusions, caps, insurance, evidence deadlines, and the joint-investigation process. Use predefined defect codes and quarantine status so all parties reconcile the same loss ledger.

## Lead-time model

Do not add each activity mechanically; build a critical-path schedule with parallel work and explicit queue time.

```text
Route A lead time
  = stock confirmation + decoration/artwork + component availability
    + Formula/batch slot + two-size fill/assembly/release
    + finished-goods export/import + SoCal receipt/acceptance

Route B lead time
  = design/engineering + tooling + samples/proofs + qualification
    + custom component production
    + Route-A manufacture and logistics

Route C lead time
  = max(Formula readiness,
        nominated component production/decor/inspection
          + domestic freight or, only if cross-border, export/import-to-ODM)
    + ODM receiving/quarantine/line slot + fill/assembly/release
    + finished-goods export/import + SoCal receipt/acceptance

Route D lead time
  = max(ODM bulk manufacture/release/export/import/filler quarantine,
        every packaging production/decor/freight/filler-inspection leg,
        filler onboarding/line-trial/slot)
    + bulk conditioning/transfer + two-size fill/assembly/release
    + domestic freight + SoCal receipt/acceptance
```

For every activity request calendar days, working days, queue assumptions, starting trigger, dependencies, sample/retest/rework allowance, peak-season effect, artwork freeze, deposit/payment trigger, and validity. Separate first order from repeat order.

**[SI]** Route A is structurally the shortest only when stock is genuinely available and accepted. Route B has the most development steps. Route C is exposed to the nominated-component chain before the ODM can fill, including border delay only when the supplier is outside the ODM country. Route D can parallelize packaging and bulk manufacture, but whichever chain finishes last controls the filler slot. No absolute route lead time is verified.

## Documentation package

### Common controlled record set

- signed commercial quote with scope boundary, currency, tax, complete `Incoterms® 2020` rule and exact named place, included/excluded logistics services, payment, price breaks, validity, and assumptions;
- controlled Product Variant BOM with supplier, manufacturer, manufacturing site, country of origin, part/revision, material/weight, dimensions/tolerances, color, decoration, closure/liner/seal, secondary and case pack;
- every primary-package supplier drawing and capacity approval record—not merely a separate summary—must state unique component/assembly and closure/liner/wiper/gasket/pipette/bulb/collar revisions; material and construction for every layer; nominal-capacity definition; brimful/overflow capacity and reference plane; fill-point height/capacity and datum; declared net quantity; actual net quantity measurement/result; statistically justified target-fill setpoint; closure intrusion/displacement and closed-package headspace; tare population/tolerance and tare-variation method; usable and residual content; test liquid or Formula, density where used, temperature, conditioning time and gravimetric/volumetric method; mean, tolerance and acceptance rule; neck finish/thread, torque range, sealing surfaces and dimensional tolerances; printable/decorable area; supplier manufacturing site, tool/cavity, test date, sample size and measurement/raw-data record; and record revision/approver;
- approved drawings, golden/limit samples, artwork proofs, specifications, change-control and discontinuation notice, each linked to the applicable capacity approval record;
- Formula and packaging safety/compatibility support appropriate to the final system; COA/CoC and relevant material, colorant, adhesive, ink/coating, glass, closure and food/cosmetic-contact declarations;
- line-trial protocol/result, fill/assembly parameters, cleaning/line clearance, in-process controls, yield/loss reconciliation, batch/lot genealogy, release record, and retains;
- leak/seal/torque/drop/vibration/temperature/decoration/consumer-use evidence required by the established quality gates;
- commercial invoice, packing list, origin, HTS/classification support, transport document, insurance, customs entry/fees, delivery and receiving records for every border and freight leg;
- U.S. label/listing/facility/responsible-person records and California packaging/toxics/extended-producer-responsibility data required by the compliance report; and
- complaint/nonconformance/CAPA/recall contacts, audit rights, confidentiality, data retention, subcontractor control, insurance, and business-continuity/change notification.

### Route-specific additions

| Route | Additional controlled records |
|---|---|
| A | ODM stock part identity and availability allocation; embedded component origins; surplus/continuity; stock decoration limitations; single-point warranty. |
| B | design input/output, tool design and ownership/location, sample rounds, validation plan, tool maintenance/life/cavity, engineering change control, reuse and transfer rights, custom surplus. |
| C | outside-component acceptance letter, supplier/ODM three-party specifications, complete delivery term into ODM, required overage, incoming test plan, storage, free-issue inventory ledger, rejected/unused return, and U.S. assist determination; when cross-border, also importer/broker and ODM-country classification/value/duty-tax. |
| D | bulk specification, vessel qualification/cleaning, SDS and transport classification, batch release/COA, seal and logger, hold-time/excursion, importer/broker entry, filler receiving/quarantine/testing, transfer/conditioning/mass balance, residual/disposal/return, domestic-filled batch release. |

## Common RFQ and evidence request

Issue the same scenario matrix to every candidate so answers remain comparable:

1. Quote cleanser, serum, and moisturizer separately at 1,000, 2,000, and 3,000 finished units per Product, using the same exact named Southern California receiving facility and address once designated. Until designated, P3 is **[U]** and offers are not comparable.
2. At every tier quote 10/90, 25/75, and 50/50 Mini/Full splits from one Formula batch; state Formula, fill-run, SKU, component, decoration, carton, and master-case minimums separately.
3. Quote the four routes as applicable: stock finished at ODM; ODM-managed custom; buyer-nominated/free-issue packaging at ODM; and released bulk supplied to a named domestic-filling model.
4. State whether quantities mean ordered, accepted, consumed, filled, released, shipped, or saleable-at-P3 units; quote Formula/bulk MOQ and batch increment, fill/SKU minimum, every primary/closure/liner/seal/decoration/carton/master-case MOQ and order increment, over/under-run, non-saleable samples/retains/tests, and all Formula/component overage.
5. Provide P0/P1/P2/P3 line items, fixed versus variable fees, first-run cash, repeat cash, surplus ownership/storage/obsolescence, and applicable stewardship fees. Report the package-driven P4 delta separately. Do not bundle an omitted leg as “included” without naming its boundary.
6. State each setup, cleaning, size changeover, line trial, filling, closure, seal, label, coding, carton, case, pallet, test, release, rework, storage, handling, and disposal fee.
7. State the exact fill and assembly equipment, change parts, speed, tolerance/control method, startup/process scrap, normal yield, Formula loss, component loss, and yield remedy by Variant.
8. Put on every applicable RFQ return, primary-package supplier drawing, and capacity approval record: unique component/assembly and closure/liner/wiper/gasket/pipette/bulb/collar revisions; material/construction of every layer; nominal-capacity definition; measured brimful/overflow capacity and reference plane; fill-point height/capacity and datum; declared net quantity and legal mass/volume basis; measured actual net quantity; statistically justified target-fill mean/setpoint, expected giveaway, tolerance and acceptance rule; closure intrusion/displacement and closed-package headspace; tare population/tolerance and variation method; usable and residual content; test liquid or Formula, validated density where used, temperature, conditioning time and gravimetric/volumetric method; neck finish/thread, torque range, sealing surfaces and dimensional tolerances; printable/decorable area; supplier manufacturing site, tool/cavity, test date, sample size and measurement/raw-data record; and record revision/approver.
9. For outside packaging, provide written acceptance; complete `Incoterms® 2020` rule and exact named place; domestic or cross-border routing; Importer of Record when applicable; duty/tax/broker treatment; inspection, storage, overage, line compatibility, defect allocation, unused inventory, and delay remedy.
10. For every route, provide transport classification for finished units corresponding to each Product Variant, mode, route, quantity, and packout. For Route D also provide bulk vessel/liner/closure, allowable quantity, net/tare, hold time, temperature and logger, bulk classification, export/import documentation, receiving tests, quarantine, transfer system, conditioning, heel/residual, mass balance, disposal/return, and contamination/excursion liability.
11. Identify every physical leg, complete `Incoterms® 2020` rule and exact named place, included/excluded services, origin/destination, mode, chargeable weight/measure, pallet/carton configuration, transit estimate, carrier allowance, insurance, customs broker and named Importer of Record, duties/fees, exam/storage/demurrage exposure, and party holding contractual risk/title.
12. Provide the exact incoming, in-process, finished, compatibility, transit and consumer-use evidence needed for the quality gates; disclose subcontractors and manufacturing/filling sites.
13. State calendar lead time and critical-path triggers for qualification samples, first order, and repeat order; provide quote validity and capacity-reservation terms.
14. Return the full sustainability dataset by exact item and site: material/BOM and transport-pack weights; PCR content and chain-of-custody evidence; manufacturing energy, water, scrap and waste; manufacturing country/site; every freight and DTC parcel configuration; damage/replacement rate; usable yield/residual; collection, sortation, MRF/reprocessor and end-market evidence by sale geography; applicable EPR data; change control; source class, confidence, uncertainty, and unknowns. Missing non-gate sustainability evidence earns no credit; it is not converted into a supplier fact.
15. State all exclusions and unknowns. A missing fee, tax, test, loss, freight leg, or responsibility is not assumed zero or included.

### Route-C acceptance questions

Use the BKOLOR general conditions as a prompt, not a template or contract example: does the ODM accept free-issue packaging in the commercial offer; who certifies it; how many test units and percent overage are required; what complete Incoterms® 2020 rule and named place applies; when cross-border, who imports and funds taxes/brokerage; what happens if components are late or incompatible; and what damages/remedies apply? ([published general conditions](https://www.bkolormakeup.com/SalesConditions/GIV_GCS_EN.pdf)).

### Route-D filler qualification questions

Ask for the exact facility and applicable registration submission path—owner/operator or eligible Responsible Person contract-manufacturer submission—while separately identifying the proposed Responsible Person and product-listing workflow; also request quality-system evidence, inspection history or regulator responses that can lawfully be shared, organization and training, sanitation/environmental controls, water system if applicable, calibration/maintenance, supplier/material control, batch records, traceability/retains, laboratory methods, deviation/OOS/CAPA, complaint/recall, data integrity, audit terms, capacity continuity, insurance, and disaster recovery. A marketing claim of “FDA certified” or “FDA approved” is not accepted; FDA states that facility registration is not approval ([FDA registration and listing](https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products)).

## Provisional comparison and stop conditions

| Route | Public operating-model evidence | Cost evidence | Release-ladder / exact-Variant evidence | Current commercial status |
|---|---|---|---|---|
| A — ODM stock | E1 public capability assertions only | No comparable route quote | Unknown/not qualified; none reaches **Prequalified for RFQ/sampling** on this report alone | **Not rankable; [SI] use as an RFQ cost-control hypothesis** |
| B — ODM custom | E1 public capability assertions only | No tooling/component/P3 quote | Unknown/not qualified; no exact configuration evidence | **Not rankable; [SI] test as a differentiation hypothesis** |
| C — nominated pack to ODM | E1 published general conditions from one separate supplier; reviewed ODM acceptance unknown | No complete route quote | Unknown/not qualified; no outside-pack acceptance or exact-line evidence | **Not rankable; requires written acceptance** |
| D — bulk to domestic filler | E1 public service/minimum assertions and one narrow public lower-bound price | E1 only, incomplete boundary | Unknown/not qualified; no exact Formula/package/line/route evidence | **Not rankable; public leads require qualification** |

Stop a route before weighted cost/sustainability scoring if any of these remains unresolved:

- the Formula-level run cannot be divided into the requested Mini/Full counts;
- a Formula/bulk batch, fill/SKU, primary, closure, liner/seal, color, decoration, carton, master-case, tooling, or line-trial minimum/order increment forces undisclosed surplus or an infeasible cash requirement;
- the exact tube/dropper/jar cannot run on the proposed line or fails a mandatory quality/compatibility gate;
- outside components or imported bulk are not accepted in writing;
- the parties cannot assign inspection, release, defect, loss, customs, and regulatory responsibilities without gaps;
- finished-unit transport classification for any Product Variant/route, or Route-D bulk classification/hold/transfer controls, is incomplete;
- any material freight, customs, storage, testing, loss, or rejection value is treated as zero because it is unknown;
- the exact named P3 destination is absent or P3 accepted-unit cost cannot be reconciled to source documents; or
- the proposed package fails a mandatory safety, quality, legality, transport, or environmental-claim gate.

After the hard gates, score candidates at the same release-ladder status using the approved weighted objectives:

| Objective | Weight | Missing evidence treatment |
|---|---:|---|
| P3 landed cost | 45% | Not comparable when a critical field cannot be bounded |
| Technical/performance risk | 20% | Unknown remains unqualified; failed hard gates stop the route |
| Sustainability | 15% | Missing non-gate evidence earns zero credit and wider uncertainty; it is not an automatic route rejection |
| Supplier reliability and lead time | 10% | Unknown receives no unsupported credit |
| Aesthetic fidelity | 10% | Score only against approved production-equivalent evidence |

## Planning recommendation

Run one synchronized RFI/RFQ wave using the matrix above:

1. request one stock-package Route-A baseline from each screened ODM lead;
2. request Route-B pricing only for a clearly classified stock-decoration, shared-tool, or new-tool proposal;
3. give the same exact nominated component BOM to the ODM for a Route-C acceptance and fee schedule;
4. obtain an ODM bulk-release/export schedule and at least one Southern California plus one geographic-counterquote filler response for Route D;
5. assign a response owner for every separately managed component/decorator, bulk vessel, carrier/forwarder, named Importer of Record, customs broker, inspection/storage provider, domestic transfer, and final-freight leg so no P3 line is orphaned; and
6. normalize all responses at the same exact P3 destination for the 27 Product-specific quantity/mix cases, in both first-run cash and consumed economic cost, then apply the approved 45/20/15/10/10 score only among configurations at the same hard-gate/release-ladder status.

**[SI] RFQ-sequencing hypothesis only:** test ODM stock as the cost-control baseline, domestic filling as the challenger, nominated packaging as the aesthetic-control exception, and ODM custom as the scale/differentiation exception. The routes remain unrankable until comparable evidence exists.

## Primary and first-party source index

### Regulators and customs authorities

- [FDA — Importing Cosmetics](https://www.fda.gov/industry/importing-fda-regulated-products/importing-cosmetics)
- [FDA — Cosmetics Importers](https://www.fda.gov/cosmetics/cosmetics-international-activities/cosmetics-importers)
- [FDA — Facility Registration and Product Listing](https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products)
- [FDA — Registration and Listing Final Guidance](https://www.fda.gov/media/170732/download)
- [FDA — Cosmetic GMP Guidelines / Inspection Checklist](https://www.fda.gov/cosmetics/cosmetics-guidance-documents/good-manufacturing-practice-gmp-guidelinesinspection-checklist-cosmetics)
- [21 U.S.C. § 364c](https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title21-section364c)
- [21 CFR 701.13](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-G/part-701/subpart-B/section-701.13)
- [49 CFR 173.24](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.24), [173.24a](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.24a), and [173.27](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.27)
- [CBP — Importing into the United States](https://www.cbp.gov/sites/default/files/documents/Importing%20into%20the%20U.S.pdf)
- [CBP — Customs Value](https://www.help.cbp.gov/s/article/Article-1162?language=en_US)
- [CBP — Importer/Exporter Tips](https://www.cbp.gov/trade/basic-import-export/importer-exporter-tips)
- [19 CFR 141.1 — Liability of Importer for Duties](https://www.ecfr.gov/current/title-19/chapter-I/part-141/subpart-A/section-141.1)
- [Korea Customs Service — Tariff Database](https://www.customs.go.kr/english/ad/ct/CustomsTariffList.do), [Tax Payment](https://www.customs.go.kr/english/cm/cntnts/cntntsView.do?cntntsId=2736&mi=8060), and [Duty Drawback](https://www.customs.go.kr/english/cm/cntnts/cntntsView.do?cntntsId=2746&mi=8056)

### ODM and supplier first-party materials

- [COSMAX ODM](https://www.cosmax.com/en/what-we-do/original-development-manufacturing/) and [Global Supply Chain](https://www.cosmax.com/en/manufacturing/global-supply-chain/)
- [Kolmar Korea Company](https://www.kolmar.co.kr/eng/about/summary.php), [Package Development Center](https://www.kolmar.co.kr/eng/rd/researcher.php), [Business Inquiry](https://www.kolmar.co.kr/eng/businessinfo/busi_inquiry.php), and [Business Areas](https://www.kolmar.co.kr/eng/businessguide/busi_area.php)
- [Cosmecca OGM System](https://www.cosmecca-esg.com/OGMSYSTEM), [Manufacturing System](https://www.cosmecca-esg.com/Manufacturing_system), and [EOGM](https://www.en.e3ogm.com/)
- [BKOLOR / Givaudan General Conditions of Sale](https://www.bkolormakeup.com/SalesConditions/GIV_GCS_EN.pdf)
- [Talara Marketing Filling](https://www.talaramarketing.com/bottlefilling)
- [Natural Cosmetic Labs Filling](https://naturalcosmeticlabs.com/pages/product-filling-services)
- [Contemporary Cosmetics Group Contract Filling](https://www.contemporarycosmetics.com/contract-filling)
- [New Look Cosmetics Skincare](https://newlookcosmetics.com/skincare/)
- [FIPI / Fill It Pack It](https://www.fillitpackit.com/)
- [Purolea Packaging and Filling](https://www.purolea.com/packaging-filling/)
