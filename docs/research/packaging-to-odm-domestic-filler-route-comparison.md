# Packaging-to-ODM versus domestic-filler route comparison

**Decision status:** planning evidence, not a sourcing award  
**Research date:** 2026-08-31  
**Scope:** cleanser, serum, and moisturizer; 1,000, 2,000, and 3,000 finished units per Product, divided between Mini and Full Product Variants  
**Delivery boundary:** accepted, fulfillment-ready units at a Southern California receiving dock  
**Related work:** [landed-cost evidence model](./packaging-landed-cost-evidence-model.md), [quality and compatibility gates](./packaging-quality-compatibility-supplier-gates.md), [sustainability scoring](./packaging-sustainability-scoring.md), and [U.S./California constraints](./us-california-cosmetic-packaging-constraints.md)  
**Issue:** [#262](https://github.com/brandon-y-lee/helix/issues/262)

## Decision in one page

No route is yet eligible to be called the lowest-cost high-quality route. Public evidence establishes credible operating models, but it does not establish a common P3 landed cost, passed exact-pack quality gates, or binding acceptance of every Mini/Full split. The correct next action is a common, line-item RFQ and technical-qualification exercise across all four routes—not a supplier award.

The evidence supports this provisional routing hierarchy:

1. **ODM stock packaging is the cost-control baseline.** It has the fewest commercial interfaces and freight handoffs. It should be quoted first whenever an exact stock system can pass the aesthetic, functional, compatibility, and sustainability gates. Whether any reviewed ODM will accept a 1,000–3,000-Formula run split into two sizes remains unverified.
2. **Bulk Formula to a domestic filler is the strongest challenger.** Public Southern California filling services explicitly advertise customer-supplied bulk and packaging, relevant formats, and entry points as low as 1,000 units ([Talara](https://www.talaramarketing.com/bottlefilling), [Natural Cosmetic Labs](https://naturalcosmeticlabs.com/pages/product-filling-services)). That makes the route plausible at helix's planning quantities, not qualified. It introduces a second manufacturing interface, international bulk movement, receiving quarantine, transfer loss, and divided defect responsibility.
3. **Helix-nominated packaging sent to an ODM is an aesthetic-control exception.** It can unlock a required tube, dropper, or jar that an ODM cannot source, but it adds at least one component supply chain and, when the nominated supplier is outside the ODM country, another import. Receiving/storage, overage, and a potentially difficult liability boundary apply either way. It should advance only with written outside-component acceptance and a route-level advantage after every leg and loss is quoted.
4. **ODM-managed custom packaging is a scale or differentiation exception.** Development, sampling, tooling, decoration minimums, and surplus are likely to dominate 1,000–3,000-unit economics unless “custom” is actually a stock mold with decoration or a shared component. No reviewed ODM publishes enough route-specific commercial detail to validate it at these runs.

These are **supported inferences**, not supplier selections. This report did not contact, select, contract, or authorize any Formula, ODM, filler, packaging supplier, broker, carrier, laboratory, or importer.

## Evidence and decision rules

Every material statement uses one of four claim classes:

| Tag | Meaning | Permitted decision use |
|---|---|---|
| **[VF] Verified fact** | Law, regulator guidance, official standard metadata, or an observable first-party term/capability | May define a gate or a documented input; still verify freshness and applicability |
| **[SA] Supplier assertion** | A supplier's own website, catalog, terms, or marketing claim | May create an RFQ/qualification lead; not independent proof of performance |
| **[SI] Supported inference** | A conclusion derived transparently from cited facts and the established landed-cost model | May guide sequencing and sensitivity analysis; not a quote or qualification result |
| **[U] Unknown** | A decision-critical value absent from current public evidence | Must remain blank, fail a gate, or be requested; never enter the model as zero |

Cost evidence follows the established E0–E5 ladder in the [landed-cost evidence model](./packaging-landed-cost-evidence-model.md). A public price is E1 even when it is precise. A route cannot be ranked “cheapest” until its critical commercial inputs reach at least comparable E3 offers and its hard quality/compliance gates pass.

The analysis keeps four boundaries separate:

- **P0:** supplier price at the quoted incoterm;
- **P1:** complete empty packaging landed at the fill site;
- **P2:** filled, assembled, released finished goods at the fill site; and
- **P3:** accepted, fulfillment-ready units at the Southern California receiving dock.

P4 pick/pack and parcel fulfillment remains outside this route decision. First-run cash and consumed economic cost are shown separately because tooling, master-carton minimums, packaging surplus, and unused bulk can materially change cash required without being consumed in the first saleable run.

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

## The four route definitions

### Route A — ODM stock packaging

The ODM selects an existing package system, sources it through its approved network, fills and assembles the Product, and exports finished goods.

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

**Benefit [SI]:** fewest buyer-managed interfaces, no separate helix-controlled component import into the ODM country, and one accountable finished-goods manufacturing counterparty.  
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
**Cost/risk [SI]:** duplicated cross-border handling, component damage and delay before filling, ODM storage, excess-component requirements, line incompatibility, and split responsibility for defects. Buyer-provided components incorporated into imported merchandise can also raise U.S. customs valuation questions as “assists”; CBP's official importing guide treats certain buyer-supplied materials incorporated into imported goods as additions to transaction value, subject to the governing valuation rules ([CBP Importing into the United States](https://www.cbp.gov/sites/default/files/documents/Importing%20into%20the%20U.S.pdf)).  
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
| Cosmecca EOGM | **[SA]** Its online catalog combines formulas, package design, production, release, and shipping ([EOGM](https://www.en.e3ogm.com/)). One specific catalog eye-patch listing states 5,000 MOQ and 60–90 days after artwork ([specific listing](https://en.e3ogm.com/TP1/?bmode=view&idx=170083823)). | A catalog model can simplify Route A. The specific listing demonstrates that “small-lot” does not prove 1,000–3,000 fit. | The cited 5,000 figure applies only to that listing and must not be generalized to cleanser, serum, or moisturizer. |
| BKOLOR Makeup & Skincare | **[VF]** A published customer contract defines buyer-supplied/free-issue materials: acceptance must appear in the offer; the buyer bears conformity/certification responsibility; additional tests require agreement; packaging must exceed ordered goods by 5%; buyer shipment is DDP to the factory; buyer pays freight, taxes, and customs; buyer-material delay extends delivery ([Givaudan/BKOLOR terms](https://www.bkolormakeup.com/SalesConditions/GIV_GCS_EN.pdf)). | Direct evidence that an outside-component model can exist and that Route C responsibility must be written, not assumed. | These are one supplier's terms, not an industry norm and not evidence that a reviewed ODM will accept helix components. |

Cosmecca's website also advertises 3–4 weeks for an existing product and 6–7 weeks for a new product. **[SA]** Those figures are a supplier assertion, not an end-to-end lead time to Southern California and not a commitment for the six Product Variants ([manufacturing system](https://www.cosmecca-esg.com/Manufacturing_system)).

### Domestic filling leads

| Provider / location | First-party scope and public minimum | Route-D relevance | Qualification gaps |
|---|---|---|---|
| Talara Marketing, Santa Ana, California | **[SA]** Accepts customer packaging and bulk; lists creams, gels, lotions, cleansers, serums, plastic tubes, glass bottles, glass jars, plastic jars, and airless formats; states MOQ starts at 1,000 and filling starts at $1.50/unit plus $100 cleaning and $100 setup ([filling](https://www.talaramarketing.com/bottlefilling), [location](https://www.talaramarketing.com/contact-us)). | Direct public alignment with all three Product types, relevant formats, a target-tier entry point, and the Southern California endpoint. | Minimum per project, Formula, size, or line; fee recurrence; closure/carton inclusion; overage and loss; tube-seal capability; exact equipment; testing; certifications/registration; quote validity; liability. |
| Natural Cosmetic Labs, Placentia, California | **[SA]** Accepts customer-supplied or its own bulk; advertises serum, cream, lotion, gel, bottle, jar, dropper and specialty filling; labels/codes/seals/cartons/cases; describes approximate ±1–2% fill tolerance and minimums varying from 500–2,500 based on size and fill volume ([filling](https://naturalcosmeticlabs.com/pages/product-filling-services), [location](https://naturalcosmeticlabs.com/pages/contact)). Its broader contract page lists tubes among packaging formats ([manufacturing](https://naturalcosmeticlabs.com/pages/contract-manufacturing)). | Public quantity range overlaps the plan; SoCal location reduces the final filled-goods leg. | Exact tube-filling acceptance; MOQ for every Product Variant; fill-tolerance specification versus legal net contents; equipment/neck/closure fit; bulk import handling; all costs; registration/certification and quality evidence. |
| Contemporary Cosmetics Group, Newark, New Jersey | **[SA]** States that customers send custom components and bulk, lists thin-to-viscous products including creams and serums, assembly/packaging, manual short-run capability, and jobs from 50 to 25,000 ([contract filling](https://www.contemporarycosmetics.com/contract-filling), [facility](https://www.contemporarycosmetics.com/new-page)). | Strong public evidence for the operating model and small orders; useful geographic counterquote. | Cleanser tubes and exact glass systems; Formula transport/receipt protocol; quality credentials; every fee and freight leg to Southern California. |
| New Look Cosmetics, Chatsworth, California | **[SA]** Advertises skincare contract manufacturing, filling/assembly, compounding/bulk-only service, and a 3,000-unit-and-above minimum ([skincare](https://newlookcosmetics.com/skincare/)). | Potential 3,000-unit California benchmark. | Whether 3,000 is per Product, Formula, SKU, or package; acceptance of imported customer bulk; exact package formats and costs. |
| FIPI / Fill It Pack It, Compton, California | **[SA]** Advertises bottles, jars, tubes and pumps; lotions, creams and gels; secondary packaging; and short or long runs ([capabilities](https://www.fillitpackit.com/)). | Relevant SoCal capability lead. | Customer-supplied imported bulk, numeric retail MOQ, exact package systems, quality gates, and all prices. |
| Purolea, Michigan | **[SA]** Advertises liquid/semi-liquid filling in bottles, jars and airless formats and small/medium lots; its home page states a 1,000-unit MOQ ([packaging and filling](https://www.purolea.com/packaging-filling/), [home page](https://www.purolea.com/)). | Geographic and operating-model counterquote at the lower target tier. | Imported customer-bulk acceptance, tube/dropper specifics, per-size minimum, quality credentials, and all landed legs. |

**[SI]** Talara and Natural Cosmetic Labs are the most direct public Southern California Route-D leads because their sites align both the customer-supplied-bulk model and the quantity range. That is a reason to request evidence, not to treat their marketing or quality claims as verified.

## A public price is not a landed-cost comparison

Talara's advertised price creates one narrow E1 anchor:

```text
advertised filling cash = ($1.50 × units filled) + ($100 × cleaning events) + ($100 × setup events)
```

**[VF]** The arithmetic follows its published terms; **[U]** the number of cleaning/setup events for Mini plus Full, what operations the per-unit price includes, accepted yield, packaging/labels/cartons, testing, freight, storage, release, rework, tax, and liability are not published ([Talara filling](https://www.talaramarketing.com/bottlefilling)). It is therefore not P2 or P3 and cannot be compared with an ODM finished-goods quote.

The same rule applies to every public price: a tube-filling quote that includes the tube and printing, a bulk-only quote, and a finished ODM quote have different boundaries. Normalize scope before comparing unit prices.

## Landed-cost model by route

Let:

- `Qtarget,s` = target accepted units for size `s` (Mini or Full);
- `Yroute,s` = accepted saleable yield after component, fill, assembly, release, and transport loss;
- `Qbuy,s` = the greater of the applicable commercial minimum and `Qtarget,s / Yroute,s`;
- `Froute` = one-time and run-level fixed cash;
- `Vroute,s` = variable cash for size `s`; and
- `Qaccepted` = accepted Mini plus accepted Full units at the Southern California dock.

```text
P3 first-run cash per accepted unit
  = [Froute + Σs(Qbuy,s × Vroute,s) + all route-specific cash items]
    / Qaccepted

P3 consumed economic cost per accepted unit
  = [cost of inputs actually consumed in accepted units
     + allocated setup/tooling
     + attributable loss, freight, inspection, and release]
    / Qaccepted
```

Unused conforming components, unfilled bulk, and reusable tooling remain inventory or assets in the consumed view only if ownership, shelf life, storage condition, reuse right, and future compatibility are documented. First-run cash still includes them.

### Route cost ledger

| Cost family | A: ODM stock | B: ODM custom | C: nominated pack to ODM | D: bulk to domestic filler |
|---|---:|---:|---:|---:|
| Formula manufacture and Formula-level testing | Include | Include | Include | Include |
| Primary, closure, liner/seal, decoration, secondary, master case | ODM quote, itemized | ODM quote, itemized | Direct suppliers plus ODM handling | Direct suppliers plus filler handling |
| Design, engineering, tooling, proof, pilot | Usually limited; verify | Material | Supplier/ODM line trial | Supplier/filler line trial |
| Component freight to fill site | Embedded or itemized | Embedded or itemized | Every supplier/decorator/export/import leg | Every supplier/decorator/import/domestic leg |
| Component import duty/tax/brokerage | Usually embedded at ODM | Usually embedded at ODM | Explicit into ODM country | Explicit into U.S. if imported |
| Receiving, quarantine, inspection, storage | ODM quote | ODM quote | Explicit ODM charge/allowance | Explicit filler charge/allowance |
| Filling, cleaning, setup, size changeover, assembly | ODM quote | ODM quote | ODM quote plus outside-pack fee | Filler quote |
| Component and process overage/loss | ODM guarantee/allowance | ODM guarantee/allowance | Supplier + ODM overage and remedies | Suppliers + filler overage; bulk heel/transfer/fill loss |
| Bulk vessel, conditioning, export/import, transfer | Not separate | Not separate | Not separate | Explicit and material |
| Finished-goods international freight and U.S. import | Explicit | Explicit | Explicit, including assist valuation review | No international finished-goods leg; bulk import replaces it |
| Domestic final freight to SoCal | Port/airport plus drayage/3PL | Same | Same | Filler to SoCal; short if local, long if remote |
| U.S. receiving, inspection, rejection/rework | Include | Include | Include | Include |
| Surplus ownership, disposal, storage, obsolescence | Verify | Likely material | Explicit by component | Explicit for bulk and every component |

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

**Route C** adds each nominated supplier/decorator leg, origin export, international component freight/insurance, customs/brokerage/duty/tax into the ODM country, ODM receiving/quarantine/inspection/storage/handling, outside-pack setup or surcharge, excess components, rejected-component return/disposal, and U.S. assist-valuation review to Route A.

**Route D** replaces finished-goods international freight with bulk vessel/deposit or disposal, bulk export packout, international bulk freight/insurance, U.S. bulk customs/FDA entry, port/airport and inland delivery to the filler, receipt/quarantine/storage, conditioning/transfer, bulk heel and line loss, filler setup/cleaning/changeover/fill/assembly/release, each packaging inbound leg, and filler-to-SoCal freight.

### Break-even tests

For two fully qualified routes with the same P3 boundary and a fixed Mini/Full mix:

```text
Qbreak-even = (Fchallenger − Fbaseline) / (Vbaseline − Vchallenger)
```

Use it only when `Vbaseline > Vchallenger`, both routes pass the same hard gates, accepted yield is normalized, and the quantity does not cross a price, MOQ, freight, or tooling tier. Otherwise compare discrete cash and consumed-cost scenarios at 1,000, 2,000, and 3,000 units.

For Route D versus Route A, the decision equation is:

```text
Route-D advantage
  = avoided finished-goods international logistics and any packaging savings
    − [bulk vessel + bulk export/import/inland logistics
       + domestic filling/setup/changeover
       + incremental QA/storage/transfer loss
       + separately managed packaging legs
       + incremental coordination and risk cost]
```

**[U]** Every monetary term is unquoted. The equation identifies the quote fields; it does not predict that domestic filling is cheaper.

## Tier and mix effects

| Scenario | Route A | Route B | Route C | Route D |
|---|---|---|---|---|
| 1,000 total, any split | **[SI]** Best structural baseline if the ODM accepts both small size orders. | **[SI]** Highest fixed-cost exposure. | **[SI]** International component freight and overage are least diluted. | **[SA]** Public 1,000-unit entry points exist. **[SI]** Each split order may still fail a per-size minimum. |
| 2,000 total | **[SI]** Better setup/freight dilution; exact tier unknown. | **[SI]** Custom economics remain uncertain without shared tooling or repeat-use plan. | **[SI]** More dilution but still two borders/flows before final U.S. receipt. | **[SI]** A credible comparison tier if both size runs fit equipment and minimums. |
| 3,000 total | **[SI]** Strongest chance of conventional ODM fit, still unverified. | **[SI]** May support decorated stock or modest customization; new tooling still unproven. | **[SI]** Direct sourcing may become more competitive, conditional on component MOQ and loss. | **[SA]** More public domestic providers enter the range. **[SI]** The route remains quality- and bulk-gated. |
| 10/90 Mini/Full | **[SI]** Mini is the likely minimum/changeover stressor. | Same plus custom Mini-component surplus. | Same plus imported Mini-component MOQ and storage. | Same plus a very small Mini fill/cleaning event. |
| 50/50 Mini/Full | **[SI]** Balanced volumes improve split feasibility. | Better tool/component utilization than 10/90, still quote-dependent. | Better freight and component utilization. | Better fill-run balance, potentially two similar setups. |

## Filling, assembly, and line compatibility

A provider's list of “tubes,” “droppers,” or “jars” is not an exact-line qualification. Each Product Variant requires a completed equipment-fit record.

| System | Compatibility evidence required before route scoring |
|---|---|
| Cleanser tube | Tube construction and recovery/crinkle behavior; diameter/length; wall and barrier structure; shoulder/neck/orifice; cap thread/hinge/torque; fill temperature and viscosity window; bottom seal/crimp type and coding area; fill direction; air control; seal integrity; leak/burst test; line tooling and guides; rate at proposed quantity; decoration rub resistance; master-case orientation. |
| Serum dropper | Bottle dimensions/finish/tolerance; fill volume and headspace; pipette length/tip clearance; bulb/collar/liner materials; thread fit and application/removal torque; dose and draw; wiper if any; fill precision; glass breakage controls; leak/inversion/ship tests; frosting/coating durability; line starwheel/chuck/tooling. |
| Moisturizer jar | Jar/neck/finish tolerance; liner or seal; cap thread/torque; fill temperature/viscosity; stringing and nozzle dive; headspace; air entrapment; net-content control; closure/liner compatibility; leak and ship tests; glass handling/breakage; decoration durability; line guides/chucks. |

For Mini and Full, request setup and cleaning time, change parts, rated and demonstrated line speed, startup scrap, normal process scrap, maximum over/under-run, fill-tolerance method, in-process sampling, rework policy, and whether both sizes can come from one released Formula batch.

The filler must not rely on an average that leaves individual packages short. FDA requires an accurate quantity declaration and allows only reasonable variation under good manufacturing practice ([21 CFR 701.13](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-G/part-701/subpart-B/section-701.13)). The exact net-contents basis and controls depend on final Formula rheology/density and final artwork.

## Packaging and Formula loss

Loss must be quoted as both a planning overage and a reconciled outcome.

| Loss point | A | B | C | D | Required evidence |
|---|:---:|:---:|:---:|:---:|---|
| Component manufacturing/decor rejects | ✓ | ✓ | ✓ | ✓ | ordered, produced, inspected, accepted, rejected, credited quantities by lot |
| Transit damage before fill | ODM-managed | ODM-managed | component international leg | each packaging leg | packing method, carrier exceptions, receiving photos/counts, claim owner |
| Incoming-inspection rejects | ✓ | ✓ | high interface importance | high interface importance | AQL/sample plan, defect classes, quarantine/disposition |
| Line trial/startup/changeover scrap | ✓ | ✓ | ✓ | ✓ | units/components and Formula consumed per size/event |
| Bulk-vessel heel / transfer loss | — | — | — | ✓ | shipped/received/transferred/returned/disposed mass balance |
| Fill giveaway and net-content rejects | ✓ | ✓ | ✓ | ✓ | target, tolerance, check-weigh data, reject/rework count |
| Closure/assembly/label/carton rejects | ✓ | ✓ | ✓ | ✓ | stage-level yield and defect codes |
| Release-test failure / quarantine | ✓ | ✓ | ✓ | ✓ | lot status, investigation, rework/destruction, liability |
| Finished-transit damage | ✓ | ✓ | ✓ | domestic leg | case/pallet spec, damage count, claim and replacement terms |

The BKOLOR terms require 5% extra buyer-supplied packaging in that specific relationship. **[VF]** This proves that overage can be contractual; it is not a universal 5% assumption ([terms](https://www.bkolormakeup.com/SalesConditions/GIV_GCS_EN.pdf)). Each quote must state required overage by component and whether unused conforming units are returned, stored, destroyed, or retained.

## Bulk Formula transport and control

Route D cannot be costed until the final Formula and shipment mode establish the transport classification. Do not assume the Formula is non-hazardous.

The bulk specification must define:

- vessel type and nominal/working capacity (for example lined drum, pail, or IBC), food/cosmetic-contact suitability, prior-use restriction, liner, closure, gasket, tamper seal, seal number, headspace, and palletization;
- cleaning/sanitization evidence, fill/closure procedure, vessel tare and net weight, batch/lot identity, sampling port, and retained samples;
- storage and transport temperature/light/orientation limits, allowable excursions, data logger, agitation or conditioning, maximum hold time, freeze/heat sensitivity, and release after excursion;
- SDS, transport classification, COA, batch release, microbial/physical/chemical specification, country of origin, invoice/packing list, and chain of custody;
- responsibility and risk transfer at every incoterm, spill response, cargo insurance, damage/temperature claim process, and security seal reconciliation;
- receiving quarantine, vessel inspection, sample/testing plan, disposition authority, storage charges/free days, and maximum wait before fill;
- transfer equipment, hoses, pumps, filters/screens, sanitation, line clearance, temperature/viscosity conditioning, heel measurement, flush/recovery/rework policy, wastewater/disposal, and reusable-vessel return; and
- mass balance: ODM net released, carrier net, filler net received, net transferred, fill giveaway, filled packages, retained/rework/disposed bulk, and remaining usable bulk.

**[VF]** U.S. hazardous-material packaging must be compatible with its contents, closed to prevent release, and able to withstand normal transport; air shipment adds mode-specific conditions ([49 CFR 173.24](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.24), [173.24a](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.24a), [173.27](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.27)). Applicability and exact packaging depend on the classified Formula and mode.

## Customs, brokerage, and regulatory interfaces

### Rules common to U.S. imports

- **[VF]** Imported cosmetics must comply with the same U.S. legal requirements as domestic cosmetics. Entry data identify the manufacturer, importer, and product; inaccurate or incomplete data can cause manual review ([FDA, Importing Cosmetics](https://www.fda.gov/industry/importing-fda-regulated-products/importing-cosmetics), [FDA import process](https://www.fda.gov/industry/import-program-food-and-drug-administration-fda/fda-import-process)).
- **[VF]** Manufacturers and processors are subject to MoCRA facility-registration and product-listing duties unless a statutory exemption applies; registration is not FDA approval or certification ([FDA registration and listing](https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products), [21 U.S.C. § 364c](https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title21-section364c)).
- **[VF]** CBP transaction value can require additions beyond invoice price, including specified packing, selling commissions, assists, royalties/license fees, or proceeds ([CBP valuation](https://www.help.cbp.gov/s/article/Article-1162?language=en_US)). The broker/importer must determine classification, origin, value, duty, and any additional duties for each actual shipment.
- **[U]** Duty, additional duty, Merchandise Processing Fee, Harbor Maintenance Fee where applicable, bond, broker, exam, storage, demurrage, detention, and drayage differ for empty packaging, bulk Formula, and finished cosmetics. No route may use a generic zero-duty assumption.

### Route C: components entering the ODM country

For a Korea-based ODM, the nominated-component flow needs a Korean importer, HS classification, origin/value, commercial invoice, packing list, transport document, customs/broker terms, duty/tax funding, delivery term, and disposition of rejected or unused components. Korea Customs Service provides the official tariff database and states that commercial imports require value and classification declarations with applicable duty/internal taxes ([tariff database](https://www.customs.go.kr/english/ad/ct/CustomsTariffList.do), [tax payment](https://www.customs.go.kr/english/cm/cntnts/cntntsView.do?cntntsId=2736&mi=8060)).

**[VF]** Korean duty drawback may be available for qualifying imported raw materials used in exported goods, but it requires documentation and calculation. **[SI]** Do not assume eligibility or that an ODM passes any recovery to helix; request the contractual treatment ([Korea Customs Service, drawback](https://www.customs.go.kr/english/cm/cntnts/cntntsView.do?cntntsId=2746&mi=8056)).

When the finished Product enters the United States, the broker must also assess whether helix-paid free-issue components or tools are customs assists and how their value is apportioned. **[U]** The route model needs the written determination, not a zero-value placeholder.

### Route D: bulk entering the United States

Bulk Formula requires its own HTS classification, origin/value, FDA product/manufacturer/importer entry data, invoice, packing list, transport document, customs bond/brokerage, and any required SDS/transport documentation. FDA describes a limited ingredient-labeling exemption for bulk cosmetics moving to an establishment for repacking or labeling when the conditions and written agreement in 21 CFR 701.9 are met. **[VF]** That is a conditional labeling mechanism, not a general exemption from cosmetics law or import review ([FDA, Cosmetics Importers](https://www.fda.gov/cosmetics/cosmetics-international-activities/cosmetics-importers)).

The quality/regulatory agreement must determine the responsible person, facility-registration and product-listing workflow, serious-adverse-event contacts, records, complaint investigation, safety substantiation, label control, and change notification. Legal duties cannot be erased by assigning them to a purchase-order line.

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

`A` means accountable by contract, `R` performs, `C` must participate, and `U` means the final legal/contractual assignment is unresolved.

| Activity | Formula ODM | Packaging supplier | Overseas ODM/filler | Domestic filler | helix / responsible person | Importer/broker/carrier |
|---|---|---|---|---|---|---|
| Formula specification and bulk release | A/R | — | C | C | C/U | — |
| Component specification and conformance | C | A/R | C/R incoming | C/R incoming | A/C/U | — |
| Package-Formula compatibility protocol | R/C | C | R/C | R/C | A/U | — |
| Exact-line trial and process controls | C | C | A/R for A–C | A/R for D | C | — |
| Bulk vessel and export release (D) | A/R | vessel supplier C | — | C | C/U | carrier C |
| Bulk receipt, quarantine, transfer (D) | C | — | — | A/R | C | carrier C |
| Filled-batch release | C/R | C | A/R for A–C | A/R for D | A/U | — |
| Customs entry and transport | C | C | C | C | A/U | A/R/U by incoterm |
| U.S. listing, label, safety, complaints | C | C | C | C | A/U | — |

This is a negotiation checklist, not a legal conclusion. Final accountable parties depend on the Formula, contract, responsible person, importer of record, and applicable exemptions.

### Defect-liability matrix

| Failure | Evidence needed to assign cause | Contract questions |
|---|---|---|
| Component out of drawing/spec before fill | approved drawing/golden sample, lot records, incoming sample plan, measurements/photos | Who inspects, by when, at whose cost; credit versus replacement; freight/sorting/expedite; Formula/slot losses caused by late components? |
| Component passes incoming but fails line | trial record, setup parameters, failure mode, component tolerance distribution, line condition | Is the component, supplier specification, ODM/filler equipment, or setup causal; who owns trial and production scrap? |
| Formula/package incompatibility | approved protocol, retains, stability/compatibility data, change history, failure analysis | Which party designed/approved protocol; remedies for components, Formula, filled stock, testing, recall, and delay? |
| Fill-weight, seal, closure, label, carton defect | batch record, in-process data, torque/seal checks, defect samples, equipment status | Rework/repack rights, charge, release authority, yield guarantee, latent-defect period? |
| Bulk contamination, excursion, or loss (D) | ODM release sample, vessel/seal record, logger, receiving sample, chain of custody, mass balance | Risk transfer; carrier/filler/ODM investigation; testing; rejected-bulk storage/disposal; replacement and lost packaging/slot? |
| Transit damage | ship configuration, pre-shipment inspection, carrier condition reports, receiving evidence | Incoterm/risk, cargo claim owner, insurance, replacement lead time, consequential-cost limits? |
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
        nominated component production/decor/inspection/export/import-to-ODM)
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

**[SI]** Route A is structurally the shortest only when stock is genuinely available and accepted. Route B has the most development steps. Route C is exposed to component-border delay before the ODM can fill. Route D can parallelize packaging and bulk manufacture, but whichever chain finishes last controls the filler slot. No absolute route lead time is verified.

## Documentation package

### Common controlled record set

- signed commercial quote with scope boundary, currency, tax, incoterm, payment, price breaks, validity, and assumptions;
- controlled Product/Variant BOM with supplier, manufacturer, manufacturing site, country of origin, part/revision, material/weight, dimensions/tolerances, color, decoration, closure/liner/seal, secondary and case pack;
- approved drawings, golden/limit samples, artwork proofs, specifications, change-control and discontinuation notice;
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
| C | outside-component acceptance letter, supplier/ODM three-party specifications, delivery term into ODM, importer/broker, Korean classification/value/duty-tax, required overage, incoming test plan, storage, free-issue inventory ledger, rejected/unused return, U.S. assist determination. |
| D | bulk specification, vessel qualification/cleaning, SDS and transport classification, batch release/COA, seal and logger, hold-time/excursion, importer/broker entry, filler receiving/quarantine/testing, transfer/conditioning/mass balance, residual/disposal/return, domestic-filled batch release. |

## Common RFQ and evidence request

Issue the same scenario matrix to every candidate so answers remain comparable:

1. Quote cleanser, serum, and moisturizer separately at 1,000, 2,000, and 3,000 finished units per Product.
2. At every tier quote 10/90, 25/75, and 50/50 Mini/Full splits from one Formula batch; state Formula, fill-run, SKU, component, decoration, carton, and master-case minimums separately.
3. Quote the four routes as applicable: stock finished at ODM; ODM-managed custom; buyer-nominated/free-issue packaging at ODM; and released bulk supplied to a named domestic-filling model.
4. State whether quantities mean ordered, filled, released, shipped, or accepted units; quote over/under-run and all required Formula/component overage.
5. Provide P0/P1/P2/P3 line items, fixed versus variable fees, first-run cash, repeat cash, and surplus ownership. Do not bundle an omitted leg as “included” without naming its boundary.
6. State each setup, cleaning, size changeover, line trial, filling, closure, seal, label, coding, carton, case, pallet, test, release, rework, storage, handling, and disposal fee.
7. State the exact fill and assembly equipment, change parts, speed, tolerance/control method, startup/process scrap, normal yield, Formula loss, component loss, and yield remedy by Variant.
8. For outside packaging, provide written acceptance, DDP/FCA or other delivery term, importer, duty/tax/broker treatment, inspection, storage, overage, line compatibility, defect allocation, unused inventory, and delay remedy.
9. For bulk, provide vessel/liner/closure, allowable quantity, net/tare, hold time, temperature and logger, transport classification, export/import documentation, receiving tests, quarantine, transfer system, conditioning, heel/residual, mass balance, disposal/return, and contamination/excursion liability.
10. Identify every physical leg, incoterm, origin/destination, mode, chargeable weight/measure, pallet/carton configuration, transit estimate, carrier allowance, insurance, customs/broker/fees, exam/storage/demurrage exposure, and party holding risk/title.
11. Provide the exact incoming, in-process, finished, compatibility, transit and consumer-use evidence needed for the quality gates; disclose subcontractors and manufacturing/filling sites.
12. State calendar lead time and critical-path triggers for qualification samples, first order, and repeat order; provide quote validity and capacity-reservation terms.
13. Provide packaging material and component weights, recycled content and evidence, recyclability design details, manufacturing country/site, freight configuration, and change-control information needed for the format-neutral sustainability score.
14. State all exclusions and unknowns. A missing fee, tax, test, loss, freight leg, or responsibility is not assumed zero or included.

### Route-C acceptance questions

Use the BKOLOR terms as a prompt, not a template: does the ODM accept free-issue packaging in the commercial offer; who certifies it; how many test units and percent overage are required; what delivery term applies; who imports and funds taxes/brokerage; what happens if components are late or incompatible; and what damages/remedies apply? ([published terms](https://www.bkolormakeup.com/SalesConditions/GIV_GCS_EN.pdf)).

### Route-D filler qualification questions

Ask for current facility registration/listing role, quality-system evidence, inspection history or regulator responses that can lawfully be shared, organization and training, sanitation/environmental controls, water system if applicable, calibration/maintenance, supplier/material control, batch records, traceability/retains, laboratory methods, deviation/OOS/CAPA, complaint/recall, data integrity, audit terms, capacity continuity, insurance, and disaster recovery. A marketing claim of “FDA certified” or “FDA approved” is not accepted; FDA states that facility registration is not approval ([FDA registration and listing](https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products)).

## Provisional comparison and stop conditions

| Route | Public operating-model evidence | Cost evidence | Technical evidence for exact six Variants | Current status |
|---|---|---|---|---|
| A — ODM stock | E1/E2 capability assertions | No comparable route quote | None | **Not rankable; establish as RFQ baseline** |
| B — ODM custom | E1/E2 capability assertions | No tooling/component/P3 quote | None | **Not rankable; exception path only** |
| C — nominated pack to ODM | One first-party free-issue contract example plus ODM capability assertions | No complete route quote | None | **Not rankable; requires written acceptance** |
| D — bulk to domestic filler | Multiple first-party service/minimum assertions; one narrow public filling-price anchor | E1 only, incomplete boundary | None | **Not rankable; credible challenger requiring qualification** |

Stop a route before weighted cost/sustainability scoring if any of these remains unresolved:

- the Formula-level run cannot be divided into the requested Mini/Full counts;
- a primary, decoration, carton, fill, or line-trial minimum forces undisclosed surplus or an infeasible cash requirement;
- the exact tube/dropper/jar cannot run on the proposed line or fails a mandatory quality/compatibility gate;
- outside components or imported bulk are not accepted in writing;
- the parties cannot assign inspection, release, defect, loss, customs, and regulatory responsibilities without gaps;
- transport classification, bulk hold/transfer controls, or route documentation is incomplete;
- any material freight, customs, storage, testing, loss, or rejection value is treated as zero because it is unknown;
- P3 accepted-unit cost cannot be reconciled to source documents; or
- the proposed package fails the mandatory compliance gates or cannot supply the evidence required for the format-neutral 15-point sustainability score.

## Planning recommendation

Run one synchronized RFI/RFQ wave using the matrix above:

1. request one stock-package Route-A baseline from each viable ODM;
2. request Route-B pricing only for a clearly classified stock-decoration, shared-tool, or new-tool proposal;
3. give the same exact nominated component BOM to the ODM for a Route-C acceptance and fee schedule;
4. obtain an ODM bulk-release/export schedule and at least one Southern California plus one geographic-counterquote filler response for Route D; and
5. normalize all responses at P3 for the nine quantity/mix scenarios, in both first-run cash and consumed economic cost, after hard-gate evidence review.

Until that evidence exists, **ODM stock is the baseline, domestic filling is the challenger, nominated packaging is the aesthetic-control exception, and ODM custom is the scale/differentiation exception**. This is the narrowest conclusion supported by current public evidence.

## Primary and first-party source index

### Regulators and customs authorities

- [FDA — Importing Cosmetics](https://www.fda.gov/industry/importing-fda-regulated-products/importing-cosmetics)
- [FDA — Cosmetics Importers](https://www.fda.gov/cosmetics/cosmetics-international-activities/cosmetics-importers)
- [FDA — Facility Registration and Product Listing](https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products)
- [FDA — Cosmetic GMP Guidelines / Inspection Checklist](https://www.fda.gov/cosmetics/cosmetics-guidance-documents/good-manufacturing-practice-gmp-guidelinesinspection-checklist-cosmetics)
- [21 U.S.C. § 364c](https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title21-section364c)
- [21 CFR 701.13](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-G/part-701/subpart-B/section-701.13)
- [49 CFR 173.24](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.24), [173.24a](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.24a), and [173.27](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.27)
- [CBP — Importing into the United States](https://www.cbp.gov/sites/default/files/documents/Importing%20into%20the%20U.S.pdf)
- [CBP — Customs Value](https://www.help.cbp.gov/s/article/Article-1162?language=en_US)
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
