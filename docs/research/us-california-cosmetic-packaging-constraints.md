# U.S. and California cosmetic-packaging constraints

**Research ticket:** [Define U.S. and California packaging constraints](https://github.com/brandon-y-lee/helix/issues/251)

**Decision date:** 31 August 2026

**Decision status:** current public-source regulatory and engineering baseline for packaging research; not final artwork, a legal opinion, a Formula classification, a carrier acceptance decision, or permission to sell

**Assumed market and route:** non-drug cosmetics sold direct to consumers in the United States, including California, with fulfillment from Southern California

**Products in scope:** Biotic Reset cleanser, Peptide Bounce serum, and Ceramide Cushion moisturizer, each in Mini and Full Size Product Variants

> This report translates public authorities into sourcing and design gates. It intentionally does not draft final label or warning copy. Product status, Formula rheology and density, package dimensions, exposure data, sales entities, manufacturing route, and current law must be confirmed before artwork, production, or shipment. Qualified U.S./California regulatory counsel must approve the final application.

## Executive decision

helix should treat packaging compliance as a sequence of evidence gates, not as a decorative review after a supplier is chosen. The principal decisions are:

1. **Reserve label space before selecting a Mini.** Each retail configuration needs a measured principal display panel (PDP), dual-unit net quantity, identity, Responsible Person contact path, other mandatory information, and readable typography. A carton can carry information, but it does not erase every immediate-container obligation.
2. **Choose the quantity basis from the Formula, not from the package or a competitor.** A liquid serum is normally declared by fluid measure; a semisolid or viscous cream is normally declared by weight. The cleanser requires a rheology and established-consumer-usage decision before artwork. Every declaration pairs the appropriate U.S. customary unit with its SI metric counterpart.
3. **Separate the label promise from the package's engineering capacity.** Nominal, brimful, fill-point, target-fill, closure-displacement, headspace, and evacuability values answer different questions. A catalog `50 mL` bottle does not prove that a lawful 50 mL declaration, a 50 mL fill target, or a particular dropper will work.
4. **Make every package component traceable.** Glass, tube laminate, closure, bulb, collar, pipette, wiper, liner, gasket, coating, ink, label, adhesive, carton, and shipper need material identity, drawings, tolerances, component weight, California toxics-in-packaging documentation, and controlled change notification.
5. **Do not turn sustainability into unsupported marketing.** SB 54 stewardship duties and an environmental marketing claim are separate. California's SB 343 restrictions remain on the books, but enforcement is preliminarily enjoined as of the decision date. helix should conservatively omit chasing arrows and recyclability claims unless a documented, current, package-specific assessment and counsel approve them.
6. **Classify the filled Formula before choosing a route.** An ordinary nonhazardous cosmetic and a flammable or otherwise regulated Formula face different DOT, air, postal, carrier, and SB 54 questions. Final-package distribution testing must use filled, decorated production-equivalent assemblies, especially for glass.

No supplier candidate passes the regulatory gate merely by saying that a package is “FDA approved,” “California compliant,” “recyclable,” “eco-friendly,” or a particular nominal capacity. Those are incomplete assertions until tied to the exact component, Formula, claim, route, evidence, and effective date.

## 1. Authority and status legend

This report uses five statuses so a voluntary test method is not mistaken for law and an unsettled rule is not treated as stable.

| Status | Meaning | Procurement treatment |
|---|---|---|
| **Binding** | Enacted statute or effective regulation applicable when its facts are met | Hard gate; obtain professional interpretation where facts or scope are uncertain |
| **Official guidance** | Agency interpretation, inspection guidance, handbook, or enforcement explanation | Strong design baseline; verify against controlling law and current revision |
| **Voluntary standard** | Consensus or industry test/specification not independently mandatory | Make contractual when it addresses the package's risk; do not call it regulatory approval |
| **Unsettled** | Law, implementation date, agency study, litigation, or rulemaking is changing | Freeze artwork only after a dated counsel/agency refresh; preserve a conservative design path |
| **Professional gate** | A conclusion requires facts or expertise not available in catalog research | Stop point for counsel, regulatory, weights-and-measures, hazmat, packaging, or test-lab approval |

Federal cosmetics law supplies the national floor. California quantity, misleading-fill, toxics-in-packaging, chemical-exposure, environmental-claim, stewardship, and resin-identification rules can add obligations. Carrier rules and contractual tests add another layer. Compliance with one layer does not establish compliance with another.

### 1.1 Constraint register

| Decision area | Status at the decision date | What helix can specify now | What remains gated |
|---|---|---|---|
| Cosmetic identity, dual quantity, business/contact, prominence | **Binding**, with **official FDA/NIST guidance** | Reserve compliant panel space and require dual units | Final words, unit basis, amount, business identity, and artwork need Formula facts and counsel |
| Net-content testing | **Binding** quantity obligation; **official handbook/enforcement methods** | Require target-fill, tare, calibration, lot sampling, and records | Filler/weights-and-measures expert validates the final process and California-incorporated method |
| Capacity vocabulary and glass tolerances | **Voluntary standards** plus helix contractual definitions | Put nominal/brimful/fill-point/closure/headspace fields in every RFQ | Packaging engineer and production-equivalent fill trials approve limits |
| Lot code and cosmetic expiry | Lot code is **official guidance/quality control**, not a general label mandate; expiry generally not mandated | Require durable unit-level lot traceability | Shelf-life/expiry representation requires final Formula-package evidence |
| Tamper evidence for the core cosmetics | Specific federal rule is **binding** only for named Product classes outside the assumption | Treat first-opening evidence as a quality option | Reopen if Product becomes oral-hygiene, vaginal cosmetic, or OTC/drug |
| Misleading container/slack fill | **Binding** federal and California law | Minimize opaque void and require a functional-void file | Counsel applies facts to final primary/carton/online presentation |
| Toxics in Packaging | **Binding** California material/certificate controls | Require component-specific certificates across all three packaging layers | Supplier/site/material changes trigger refreshed evidence |
| Proposition 65 | **Binding** when exposure facts trigger it | Collect composition and exposure inputs | Qualified exposure assessment and counsel decide whether/how to warn |
| FTC environmental claims | Deception law is **binding**; Green Guides are **official guidance** | Ban unsubstantiated general-benefit, recyclable, recycled-content, and refillable claims | Claim-specific evidence and counsel approve final language |
| SB 343 | Statute is **binding**, enforcement **unsettled/enjoined** | Omit chasing arrows/recyclability indicators by default | Refresh litigation, dates, studies, package facts, and counsel immediately before manufacture |
| SB 54 | **Binding**, effective regulations with implementation still developing | Build a component-level material/weight/count ledger now | Resolve producer, deadline, CMCs, exemptions, PRO/independent path, and reporting with counsel |
| DOT/PHMSA transport | **Binding** if the filled Product is hazardous material | Require final Formula classification before route approval | Hazmat professional/offeror signs classification and exact-mode packout |
| USPS/carrier liquid rules | **Binding postal or contractual service conditions** when that service is used | Preserve capacity for absorbent/secondary/protective packout | Recheck current service rules and carrier acceptance at shipment |
| ISTA/ASTM distribution tests | **Voluntary standards** unless contracted | Require a route-specific filled-package qualification plan | Packaging engineer/lab selects protocol and approves deviations |

## 2. Federal label architecture

### 2.1 Package layers and required-information logic

The FDA's current [Cosmetics Labeling Guide](https://www.fda.gov/cosmetics/cosmetics-labeling-regulations/cosmetics-labeling-guide) explains the operative architecture:

- the retail outer container is generally the package; if there is no carton or other outer retail container, the immediate container is the package;
- the outer PDP carries the Product identity and net quantity;
- other required information belongs on information panels, including the business identity/address, ingredients, directions and warnings where required, and the current MoCRA contact path;
- an immediate container inside an opaque carton still needs specified basics, including Product identity, directions/warnings, name/place, and net quantity; required outer information can be visible through a transparent package where the rules allow; and
- required information must be prominent and conspicuous, with adequate contrast and without crowding it with design material.

The controlling misbranding statute independently reaches false or misleading information, missing identity/business/quantity/contact information, inconspicuous required facts, and a misleadingly made, formed, or filled container ([21 U.S.C. § 362](https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title21-section362)).

**Decision implication.** The packaging BOM must identify the exact consumer-facing configuration: immediate container alone, immediate container plus carton, bundle, or other retail pack. Artwork review then maps every required element to a layer. “We will put it on the website” is not a substitute for information required on the label.

### 2.2 PDP area is a geometry problem

Under the FDA guide, the PDP is not whatever face the designer happens to use:

| Package form | PDP design baseline |
|---|---|
| Rectangular package | One entire side, chosen appropriately for display |
| Cylindrical package | 40% of the product of height times circumference |
| Other form | 40% of total surface, excluding tops, bottoms, flanges, shoulders, necks, and similar unusable surfaces |

The net-quantity declaration normally sits within the bottom 30% of the PDP. The FDA guide describes an exception to that location rule for a PDP of 5 square inches or less. This does **not** remove the declaration or its legibility requirement.

For the sizes relevant here, the FDA guide specifies these minimum net-quantity character heights:

| PDP area | Minimum net-quantity character height |
|---|---:|
| 5 square inches or less | 1/16 inch |
| More than 5 through 25 square inches | 1/8 inch |
| More than 25 through 100 square inches | 3/16 inch |

Ingredient text is generally at least 1/16 inch; the guide allows 1/32 inch where the available label surface is less than 12 square inches. Warning text is generally at least 1/16 inch. The final reviewer must apply the FDA measurement method to rendered physical artwork, not a zoomed screen view.

**Decision implication.** Every supplier RFQ for a Mini must provide dimensioned drawings, printable/decorable areas, curvature and seam exclusions, closure overlap, and a physical sample. helix should create a label-area budget before commercial selection, then render and measure the exact die line at 100% scale.

### 2.3 Dual units are mandatory for the assumed Products

For a consumer commodity within the Fair Packaging and Labeling Act, the net quantity must use the most appropriate units of **both** U.S. customary measure and SI metric measure ([15 U.S.C. § 1453(a)(2)](https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title15-section1453)). NIST's current [Packaging and Labeling](https://www.nist.gov/pml/owm/packaging-and-labeling) page confirms that the United States currently requires dual-unit labeling and that a metric-only package does not comply with that federal requirement.

The FDA guide's statement that metric quantity “may additionally be stated” should therefore not be used as a metric-optional permission. The statute and NIST's current explanation control this planning baseline. FDA also explains that a combined metric/customary declaration still has to satisfy the applicable placement, separation, and type requirements ([FDA Compliance Policy Guide § 140.500](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/cpg-sec140500-metric-declarations-quantity-contents-product-labels)).

This report intentionally does not compose the final quantity line. It selects the required measurement pair:

| Product | Conditional physical-state finding | Recommended declaration basis | U.S./SI pair | Gate before artwork |
|---|---|---|---|---|
| **Peptide Bounce serum** | Liquid, if the final Formula remains readily flowable | Fluid measure | fluid ounce + milliliter | Confirm final Formula is liquid; validate fill at the required reference conditions |
| **Ceramide Cushion moisturizer** | Semisolid/viscous cream | Net weight | avoirdupois ounce + gram | Confirm rheology; establish target mass and tare controls |
| **Biotic Reset cleanser** | Unknown until the final catalog Formula is characterized | Fluid measure if liquid/pourable; net weight if semisolid/viscous, absent a firmly established contrary consumer usage/trade custom | fluid ounce + milliliter **or** ounce + gram | Regulatory counsel and filler document physical state and any trade-custom rationale before artwork |

The FDA guide states the default distinction: liquids use fluid measure; solids, semisolids, viscous products, and mixtures of solid and liquid use weight, unless firmly established consumer usage and trade custom provide otherwise. Package form does not choose the basis. A tube does not automatically mean weight, and a jar or dropper does not automatically mean volume.

For fluid measure, FDA describes volume at 68°F/20°C. For net weight, Product mass excludes the package. A weight declaration cannot be converted to milliliters without measured density; a volumetric fill process needs the final Formula's density/temperature relationship to control the declared amount.

### 2.4 Reasonable variation is not permission to target the declaration

The net amount is the Product delivered, excluding its package. The FDA guide recognizes reasonable variations caused by ordinary moisture change and good manufacturing practice, but the stated quantity still must be accurate. California officials also test packaged goods for quantity compliance; NIST's current [Handbook 133](https://www.nist.gov/pml/owm/nist-handbook-133-current-edition) is the national procedural reference, while California's published regulations and field manual identify the edition incorporated for state enforcement ([CDFA Device and Quantity Control](https://www.cdfa.ca.gov/dms/programs/qc/qc.html); [CDFA publications](https://www.cdfa.ca.gov/dms/publications.html)).

**Professional gate.** The filler and a qualified weights-and-measures reviewer must set a statistically defensible target above the declaration, validate tare and measurement methods, define lot sampling and corrective action, and confirm the California-incorporated Handbook 133 edition at release. This report does not assume that California automatically incorporates every later NIST revision.

### 2.5 Name, place, and MoCRA contact consume real space

The label must identify the manufacturer, packer, or distributor as required, with appropriate qualification when the named business is not the actual manufacturer. Under MoCRA, the “Responsible Person” is the manufacturer, packer, or distributor whose name appears on the cosmetic label; that role carries adverse-event and safety-substantiation duties ([FDA MoCRA overview](https://www.fda.gov/cosmetics/cosmetics-laws-regulations/modernization-cosmetics-regulation-act-2022-mocra)). Current law also requires a domestic address, domestic telephone number, or electronic contact information—including a website—through which the Responsible Person can receive adverse-event reports ([21 U.S.C. § 364e](https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title21-section364e)).

FDA does not preapprove cosmetic labels; the company remains responsible for compliance ([FDA cosmetic-label preapproval answer](https://www.fda.gov/industry/fda-basics-industry/does-fda-pre-approve-cosmetic-product-labeling)). A component supplier's compliance logo or representation cannot transfer this responsibility.

### 2.6 Foreign-language and claim consequences

If a label contains a representation in a foreign language, the FDA guide generally requires the required statements to appear in that language as well. Marketing should not add multilingual copy to a space-constrained Mini without recalculating the full label budget.

Drug claims would change the Product's status and reopen OTC/drug labeling, tamper-evidence, establishment, active-ingredient, and manufacturing requirements. The present analysis assumes cosmetics only. No package or label is released until Product Claims have been screened against that assumption.

## 3. Mini feasibility gate

### 3.1 There is no general “small bottle” exemption

The FDA guide includes narrow accommodations for very small packages, including an exemption associated with packages below 1/4 avoirdupois ounce or 1/8 fluid ounce when properly mounted on a labeled display card or outer container. The expected helix Minis are larger, so sourcing must not assume that “travel size” or “Mini” relaxes the normal requirements.

The guide also describes off-package ingredient mechanisms for certain decorative or small packages and tightly constrained retail displays. Those are fact-specific mechanisms, not a general direct-to-consumer waiver. A carton, tag, tape, or leaflet may solve part of a design problem only after counsel confirms the exact provision and retail configuration.

### 3.2 Required Mini label-area budget

Before a Mini component is commercially acceptable, create one row for every information block and assign it to the immediate container, outer package, or both:

| Budget block | Immediate-container question | Outer-package question |
|---|---|---|
| Product identity | Is the name/identity present and conspicuous? | Is identity on the PDP? |
| Dual net quantity | Is the required immediate quantity present where applicable? | Is the dual-unit declaration in the proper PDP zone and type size? |
| Business identity/place | What exact firm and qualifier appear? | Is the required name/place complete? |
| MoCRA contact | Which domestic address, phone, or electronic channel belongs to the Responsible Person? | Is it usable and monitored? |
| Ingredients | Is an outer package present? | Is the declaration complete, ordered, and legible? |
| Directions/warnings | Does safe use require either? | Are all required directions/warnings carried at the proper layer? |
| Lot code | Can a permanent readable code survive handling? | Is the code visible or cross-referenced? |
| Product Claims | Do claims preserve cosmetic status and have substantiation? | Do callouts crowd or contradict required information? |
| California warning, if any | Has exposure—not mere presence—been assessed? | Does online/outer warning treatment match current counsel direction? |

Do not count cap tops, tube crimps, bottle shoulders, jar bottoms, glass frosting variation, or areas interrupted by seams as usable until a dimensioned sample proves readability. Dropper collars, overcaps, and jar closures can hide text in ordinary use and should not carry critical copy without specific approval.

### 3.3 Mini pass/fail protocol

A Mini passes this gate only when all of the following are complete:

1. dimensioned drawings and the final closure assembly define usable surfaces;
2. the actual consumer configuration—bare primary, carton, or other—has been selected;
3. the quantity basis and nominal declared amount are frozen for the Product Variant;
4. artwork at physical size meets the PDP, location, prominence, contrast, and type-size rules;
5. the Responsible Person and monitored adverse-event contact route are fixed;
6. every optional claim and foreign-language element has been counted;
7. the physical sample remains readable after decoration, filling, handling, abrasion, moisture, and closure application; and
8. U.S./California regulatory counsel signs the architecture before plates, screens, molds, or production decoration are authorized.

If it fails, the remedy order is: remove optional copy, simplify claims, use a legally supportable outer layer, increase the package, or abandon that component. Shrinking required text below the minimum is not a remedy.

## 4. Quantity and capacity control model

### 4.1 Controlled vocabulary

The following definitions should appear in every RFQ and drawing because supplier catalogs use “capacity” inconsistently. Except for declared/actual net quantity, these are engineering terms adopted for helix's controls, not assertions that U.S. law gives each term this exact meaning.

| Term | Controlled meaning | What it does **not** prove |
|---|---|---|
| **Declared net quantity** | The amount promised on the label in the legally appropriate dual units | Package capacity, fill target, or usable dose count |
| **Actual net quantity** | Measured Product delivered, excluding packaging; for mass, gross filled mass minus validated tare | Target fill or average catalog capacity |
| **Target fill** | Filler setpoint chosen above the declaration to control process variation | Consumer claim or guaranteed evacuation |
| **Nominal capacity** | A supplier/design reference whose plane, closure state, temperature, and method must be stated on the drawing | Brimful capacity or lawful label amount |
| **Brimful/overflow capacity** | Internal volume to the top or a specified overflow plane using a defined method | Volume available after closure insertion |
| **Fill-point capacity** | Internal volume to a specified height or datum | Headspace after closure or pipette insertion |
| **Closure displacement** | Volume displaced into the filled cavity by plug, liner, wiper, pipette, dropper, or other closure geometry | A constant across closure revisions |
| **Headspace/ullage** | Unoccupied internal volume in the closed filled assembly at defined conditions | A cosmetic-only choice if transport rules apply |
| **Tare** | Mass of the empty package configuration used by the measurement method | One universal number across component lots |
| **Evacuable/usable content** | Product a user or test method can remove under defined use conditions | Regulatory net quantity |
| **Residual content** | Product remaining after the defined evacuation/use protocol | Automatic evidence of short fill |

For glass capacity verification, ISO 8106:2004 provides a gravimetric method and specification limits and remains current after ISO's review ([ISO 8106](https://www.iso.org/standard/35616.html)). ISO 12818:2013, confirmed in 2022, addresses tolerances for brimful capacity and dimensional characteristics of glass bottles used for pharmaceutical, cosmetic, perfumery, and chemical Products ([ISO 12818](https://www.iso.org/standard/62019.html)). These are voluntary standards unless adopted into a contract or another applicable rule.

### 4.2 Package-specific implications

**Cleanser tube.** Supplier “fill volume” depends on tube diameter, cut length, head style, crimp/seal allowance, cap, Formula viscosity, trapped air, and filler method. The Aesop-like crinkling metal or metal-rich tube and the Rhode-like resilient plastic/laminate tube need separate drawings, fill trials, seam/crimp validation, evacuation criteria, and label-area evaluations. The same external dimensions do not establish equal capacity or usable content.

**Serum dropper.** The bottle must be evaluated with the actual pipette, bulb, collar, wiper/reducer if any, and thread/finish. Pipette insertion can displace Product, a fuller bottle can flood the neck, and a pipette may not reach or evacuate the corners of a square or shouldered bottle. Dose, leakage, aspiration, bulb recovery, component compatibility, and residual content are separate from the label's fluid volume.

**Moisturizer jar.** Brimful volume overstates useful fill because the liner, sealing surface, cream peak/level, closure intrusion, and user-opening behavior require headspace. Net weight remains independent of the jar's catalog milliliters. Wide-mouth geometry must also be tested for liner adhesion, torque, leakage, evaporation, decoration abrasion, and finger/tool access.

### 4.3 Capacity drawing and verification fields

Every primary-package drawing and approval record must state:

- unique component and assembly revision;
- material and construction for every layer;
- nominal capacity definition;
- brimful/overflow capacity and its reference plane;
- fill-point height/capacity and datum;
- test liquid or Formula, temperature, conditioning time, and gravimetric/volumetric method;
- mean, tolerance, and acceptance rule—not only a single catalog value;
- closure, liner, wiper, gasket, pipette, bulb, and collar revisions;
- closure intrusion/displacement and required closed-package headspace;
- package tare and tare-variation method;
- neck finish/thread, torque range, sealing surfaces, and dimensional tolerances;
- printable/decorable area; and
- supplier site, tool/cavity, date, sample size, and measurement record.

Headspace should be determined on the closed assembly from traceable measurements, not assumed as `brimful minus label amount`. The final Formula can foam, retain air, expand, contract, wet surfaces, or react differently from water. A closure can also alter available volume.

### 4.4 Release control

The fill protocol should link four records without conflating them:

```text
declared quantity → statistically justified target fill → validated fill process → lot net-content verification
```

For weight-declared Product, define the tare population and gross-to-net calculation. For volume-declared Product, define the legal reference temperature, fill equipment calibration, final Formula density relationship, and verification method. Destructive tests, setup units, retains, leakage samples, and fill losses must be budgeted separately from saleable units.

The label declaration cannot be frozen from the empty-package drawing alone. It requires a production-equivalent fill/closure study and enough process-capability evidence to show that the declaration, headspace, closure, and distribution route work together.

## 5. Lot coding, shelf life, and tamper boundaries

### 5.1 Lot coding is a strong control, not a general cosmetic-label mandate

FDA states that production lot numbering is not legally required for cosmetics, but recommends enough lot/batch identification and distribution records to support positive identification and an effective recall ([FDA Recall Policy for Cosmetics](https://www.fda.gov/cosmetics/cosmetics-compliance-enforcement/fda-recall-policy-cosmetics)). FDA's nonbinding [cosmetic GMP inspection checklist](https://www.fda.gov/cosmetics/cosmetics-guidance-documents/good-manufacturing-practice-gmp-guidelinesinspection-checklist-cosmetics) likewise recommends permanent code marks, batch identification, and production/control records.

helix should contractually require a durable, human-readable lot code on every saleable unit and link it to:

- Formula batch and fill lot;
- component supplier, site, drawing revision, lot, and decoration lot;
- fill/assembly line, date, and release results;
- secondary and tertiary packout revision;
- destination and distribution records; and
- complaint, return, and recall disposition.

The code location and technology must survive frosting, coating, ink cure, abrasion, moisture, oils, carton insertion, and fulfillment handling. A removable carton-only code is weak if units can be separated from cartons.

### 5.2 Expiration date

FDA does not generally require a cosmetic expiration date, but the manufacturer remains responsible for determining shelf life and Product safety ([FDA expiration-date answer](https://www.fda.gov/industry/fda-basics-industry/do-i-need-label-my-cosmetics-products-expiration-dates)). Any expiration, period-after-opening, or shelf-life representation therefore requires Formula/package stability and compatibility evidence; it is not supplied by choosing glass or a barrier tube.

### 5.3 Tamper evidence

The specific federal cosmetic tamper-resistant-packaging rule applies to retail liquid oral-hygiene Products and vaginal cosmetic Products ([21 C.F.R. § 700.25](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-G/part-700/section-700.25); [FDA labeling summary](https://www.fda.gov/cosmetics/cosmetics-labeling-regulations/summary-cosmetics-labeling-requirements)). Under the cosmetic-only assumption, the three core Products are outside that rule.

This does not prevent helix, a retailer, carrier, or quality system from requiring first-opening evidence, a seal, liner, band, or other security feature. It means the feature should be specified as a quality/consumer-trust control, not represented as a universal federal cosmetic requirement. If a Product becomes an OTC drug, the tamper and label analysis must be reopened before package selection.

## 6. Package safety and California material restrictions

### 6.1 Federal adulteration and Formula-specific compatibility

A cosmetic is adulterated if its container is composed of a poisonous or deleterious substance that may render the contents injurious ([21 U.S.C. § 361](https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title21-section361)). FDA also identifies inadequate preservation or packaging protection as a microbiological-safety risk ([FDA Microbiological Safety and Cosmetics](https://www.fda.gov/cosmetics/potential-contaminants-cosmetics/microbiological-safety-and-cosmetics)).

No generic glass, resin, laminate, metal, ink, or closure should be described internally as “FDA approved” for a final cosmetic. The required gate is Formula-specific safety and compatibility across the Product's intended shelf life and abuse conditions, including relevant migration/extractables/leachables, sorption, corrosion, stress cracking, light/oxygen/water transmission, seal integrity, microbial protection, dose, evacuation, and decoration interaction. Those final-Formula studies belong to the later validation plan; supplier documents and empty-pack tests are screening evidence, not substitutes.

### 6.2 California Toxics in Packaging

California's Toxics in Packaging law prohibits intentional introduction of lead, cadmium, mercury, or hexavalent chromium into a package or packaging component and limits the incidental sum of those four metals to 100 parts per million by weight. California treats primary, secondary, and tertiary packaging and components—including coatings, closures, inks, labels, dyes/pigments, adhesives, stabilizers, and additives—as in scope. The manufacturer or supplier must furnish a signed Certificate of Compliance, and the purchaser must obtain and retain it while the package or component remains in use and make it available to DTSC on request ([DTSC Toxics in Packaging](https://dtsc.ca.gov/toxics-in-products/toxics-in-packaging/); [DTSC purchaser fact sheet](https://dtsc.ca.gov/wp-content/uploads/sites/31/2016/01/TIPPurchasers_FINAL-1.pdf); [DTSC certificate-retention FAQ](https://dtsc.ca.gov/faq/how-long-do-i-have-to-keep-a-certificate-of-compliance/)).

**Hard RFQ gate.** Obtain a current, signed, exact-component certificate for:

- each tube layer/head/cap and any foil or seal;
- glass bottle/jar, colorant, frosting/coating, and decoration;
- dropper bulb, collar, pipette, wiper, liner, gasket, and ink;
- jar closure, liner, seal, spatula if any, and decoration;
- labels and their ink/adhesive/varnish;
- folding carton, inserts, tissue, tape, and adhesive; and
- shipper, printing, labels, tape, void fill, and protective parts.

A new supplier, material, color, finish, ink system, adhesive, tool, site, or formulation triggers a new or amended certificate and change review. An umbrella statement for “our bottles” is not enough if it cannot be traced to the ordered revision.

### 6.3 Proposition 65 is exposure-based

Proposition 65 can require a clear and reasonable warning before a knowing and intentional exposure to a listed chemical unless the business establishes that the exposure is below the applicable cancer or reproductive-toxicity threshold. Businesses with fewer than 10 employees are exempt, but that status must be verified and may change. OEHHA emphasizes that determining exposure can be complex, that businesses bear the relevant burden, and that unnecessary warnings are discouraged ([OEHHA Businesses and Proposition 65](https://oehha.ca.gov/proposition-65/businesses-and-proposition-65)).

Therefore:

- a supplier's chemical-presence list is not itself a warning decision;
- a non-detect result under an unspecified method is not an exposure assessment;
- the Formula and package colorants, inks, coatings, adhesives, metal parts, glass, and foreseeable handling routes must be considered together; and
- if a warning is required, current safe-harbor methods, internet/catalog treatment, and the amended short-form rules require counsel review ([OEHHA 2024 warning-rule amendments](https://oehha.ca.gov/proposition-65/crnr/proposition-65-clear-and-reasonable-warnings-safe-harbor-methods-and-content)).

This report does not recommend or draft a warning. The professional gate is a documented Product-specific exposure assessment and current California counsel determination before artwork and online Product copy are locked.

### 6.4 California RPPC exemption and resin identification are different rules

CalRecycle states that rigid plastic packaging containers used for cosmetics are exempt from California's Rigid Plastic Packaging Container program ([CalRecycle RPPC exemptions](https://calrecycle.ca.gov/plastics/rppc/exemptions-waivers/)). That exemption does **not** exempt cosmetic packaging from SB 54, toxics-in-packaging, environmental-claim, or general misleading-label rules.

California's separate resin-identification provisions apply to specified rigid plastic bottles and containers with capacity at or above 8 ounces and below 5 gallons; the state publishes the governing provisions in its [California Plastic Laws compilation](https://www2.calrecycle.ca.gov/Publications/Download/1446). The currently envisioned glass bottle/jar and flexible tube do not fit that rigid-plastic category. Any future Big Size in a qualifying rigid plastic package requires a fresh marking review. Keep any required resin code inconspicuous and do not transform it into a front-facing chasing-arrows claim.

## 7. Misleading fill and slack fill

Federal law treats a cosmetic as misbranded if its container is so made, formed, or filled as to be misleading ([21 U.S.C. § 362(d)](https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title21-section362)). California separately prohibits false bottoms, false walls, false lids, and misleading package construction or fill, and creates a presumption for nonfunctional slack fill in an opaque package ([California Business and Professions Code § 12606](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=12606.)).

California identifies functions that can justify empty space, including protection, machinery requirements, unavoidable settling, room for required labels, pilfering/handling devices, visible package dimensions or fill lines, consumer mixing/dispensing needs, and delivery devices. The e-commerce-related provision is fact-specific and does not erase federal deception risk.

**Decision rule.** Every opaque primary or carton with conspicuous empty volume needs a dated slack-fill file containing:

- external, brimful, fill-point, and closed-package dimensions;
- declared amount, target fill, and measured headspace;
- the precise functional reason for each void;
- design alternatives considered and why less void would impair that function;
- representative filled photographs or imaging;
- protection, dispensing, machinery, settling, or label-area evidence; and
- counsel approval for the final retail and online presentation.

Avoid cartons materially larger than the protected assembly unless documented protection or another statutory function requires them. A premium aesthetic or shelf presence alone is not a functional justification.

## 8. Environmental claims and California stewardship

### 8.1 FTC claims baseline

The FTC Green Guides describe the Commission's current views on avoiding deceptive environmental claims. The guides do not themselves bind the FTC or public and do not preempt stricter law, but deceptive advertising remains enforceable under FTC Act § 5 ([16 C.F.R. § 260.1](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260/section-260.1); [FTC Green Guides](https://www.ftc.gov/legal-library/browse/rules/green-guides)).

For sourcing and artwork:

- do not make broad, unqualified “green,” “eco-friendly,” or similar general-benefit claims;
- qualify the specific environmental attribute clearly, prominently, and close to the claim;
- hold competent and reliable evidence for express and implied claims;
- identify the component and percentage when claiming recycled content, and count material actually diverted from the waste stream;
- do not claim “refillable” without a genuine method/system for refilling;
- substantiate source-reduction claims against a named, appropriate comparison; and
- make an unqualified recyclable claim only where the relevant item can be recycled by a substantial majority—about 60%—of consumers or communities where it is sold; qualify lower availability and package-specific limitations.

The FTC's official [Green Guides summary](https://www.ftc.gov/business-guidance/resources/environmental-claims-summary-green-guides) is the operational source for those principles. A certification or seal does not replace substantiation.

An inconspicuous, molded resin-identification code on the bottom ordinarily has a different claim context from a conspicuous chasing-arrows symbol near the Product name; the FTC addresses that distinction in [16 C.F.R. § 260.12](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260/section-260.12). California can be more restrictive.

### 8.2 SB 343 is binding law with currently enjoined enforcement

California SB 343 prohibits chasing arrows and other recyclability indicators unless statutory criteria are met. CalRecycle published final material-characterization findings on 4 April 2025, updated Table 2 on 24 June 2026, and states that restrictions apply to packaging manufactured after 4 October 2026. On 14 July 2026, however, a federal court issued a preliminary injunction that blocks enforcement of SB 343 only; CalRecycle continues its study work and says the deadline may be affected by the litigation ([CalRecycle Accurate Recycling Labels](https://calrecycle.ca.gov/wcs/recyclinglabels/)).

This is an **unsettled implementation gate**, not a basis to ignore the law or promise recyclability. CalRecycle does not decide whether a particular package is recyclable; the responsible party must assess the actual item using current state data and any permitted additional information.

Until counsel documents otherwise, helix should:

1. omit chasing arrows, “recyclable,” “widely recyclable,” and implied-equivalent symbols from all six Product Variants;
2. keep any legally required resin code inconspicuous and limited to its identification function;
3. separately record each component, material, coating, color, label, adhesive, size, and separability feature;
4. recheck the injunction, statutory date, CalRecycle tables, and the 2027 study before artwork lock and again before manufacture; and
5. approve a future claim only with a package-specific substantiation record covering California and every other sales geography.

### 8.3 SB 54 applies to the packaging system, not only plastic primaries

California SB 54 establishes extended producer responsibility for single-use packaging across sectors. Permanent regulations became effective on 1 May 2026; Circular Action Alliance is the first approved producer responsibility organization (PRO), and it submitted its first plan on 15 June 2026 ([CalRecycle SB 54 program](https://calrecycle.ca.gov/packaging/packaging-epr/)).

CalRecycle's current [Producer Guidance](https://calrecycle.ca.gov/packaging/packaging-epr/producerguidance/) says a producer must apply to participate in the PRO plan, submit an independent-producer application, or obtain a small-producer exemption. Program targets phase in from 2027 through 2032, culminating in 25% source reduction of single-use plastic, 65% recycling of single-use plastic, and 100% of covered single-use packaging/plastic food-service ware being recyclable or compostable by 2032.

The covered-material concept reaches separate components used for containment, protection, handling, delivery, and presentation. For this program that can include:

- tube, bottle, jar, cap, dropper, bulb, collar, wiper, liner, gasket, seal, and label;
- carton, insert, leaflet, overwrap, tissue, and bundle material; and
- shipper, protective insert, tape, label, bag, air pillow, and other fulfillment packaging.

Cosmetics are not generally excluded. An OTC drug that is not also a cosmetic has a different exclusion analysis. A package does not become reusable or refillable merely because its material is durable; the statutory/program definition requires an actual system and infrastructure. CalRecycle's [Identifying Covered Materials guidance](https://www2.calrecycle.ca.gov/Docs/Web/138814) should be applied to the exact BOM.

The statutory “producer” is resolved through a tiered fact pattern—such as California manufacturer, trademark/brand owner or exclusive licensee, or first seller/importer—not by choosing a convenient contract label. CalRecycle publishes a current [producer screening tool](https://www2.calrecycle.ca.gov/Docs/Web/138796). The Legal Operator, Responsible Person, ODM, filler, importer, and brand licensor may not be the same entity.

Under CalRecycle's current guidance, a producer with gross annual sales below $1 million may apply for the small-producer exemption, but it is not automatic and does not remove every registration or future planning obligation ([CalRecycle extensions, exemptions, and exclusions](https://calrecycle.ca.gov/packaging/packaging-epr/exemptionsexclusions/)). De minimis component treatment likewise requires the program's process rather than an internal assumption.

The effective regulations set time-sensitive registration/application rules. A producer already in existence when the regulations became effective had 30 days from 1 May 2026; one becoming a producer after that date but before 1 January 2027 has 30 days; one becoming a producer on or after 1 January 2027 has six months. The current [final SB 54 regulations](https://www2.calrecycle.ca.gov/Docs/Web/138757) control the exact event, filing route, and required data. Because helix's entity and first-supply facts are unresolved, this report does not declare which clock applies. Counsel and the program owner must resolve it before the first California supply, not after launch.

Some plastic packaging used to contain hazardous materials can fall within a program exclusion when the exact statutory and regulatory conditions are met. Do not infer that exclusion from a safety data sheet, a limited-quantity transport exception, or the word “hazardous”; map the final classification and package to CalRecycle's current exclusion process.

**Immediate operational requirement.** Before a supplier award, create an SB 54 BOM ledger with one row per component and these fields:

```text
Product / Product Variant
retail, secondary, tertiary, or fulfillment layer
component and drawing revision
supplier legal entity and manufacturing site
material, resin, laminate layers, coating, color, ink, and adhesive
Covered Material Category candidate and basis
unit mass and measurement method
plastic component count
California units supplied and reporting period
recycled-content evidence, if any
reusable/refillable-system evidence, if asserted
change effective date and superseded revision
source document, owner, and approval status
```

Before first California sale, current counsel must determine the statutory producer, registration deadline, PRO/independent/small-producer path, covered-material classifications, data period, and reporting owner. No registration, exemption application, or claim is authorized by this report.

SB 54 compliance is a stewardship duty. It does not prove an environmental marketing claim, and a CalRecycle material category does not by itself establish that helix may label the specific package recyclable under SB 343 or the FTC standard.

## 9. Liquid and glass transport

### 9.1 Classify the filled Product first

The offeror of a hazardous material is responsible for classification, packaging, marking, labeling, and shipping papers. PHMSA's shipper guidance emphasizes that this determination comes before offering a package for transport ([PHMSA shipper-responsibility overview](https://www.phmsa.dot.gov/training/hazmat/phmsas-quarterly-newsletter-hazardous-materials-safety-january-march-2022)).

If a final Formula is hazardous material, [49 C.F.R. § 173.24](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.24) requires packaging designed and closed so there is no release under normally incident temperature, humidity, pressure, shock, loading, and vibration; packaging/content compatibility; secure leakproof closures; and enough ullage for liquid expansion. Nonbulk and air shipments add requirements, including pressure/temperature and closure controls ([49 C.F.R. § 173.24a](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.24a); [49 C.F.R. § 173.27](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-173/subpart-B/section-173.27)).

An ordinary nonhazardous, water-based cosmetic may fall outside those Hazardous Materials Regulations, but “cosmetic,” “natural,” or “alcohol-free” is not a transport classification. A qualified hazmat professional must review the final Formula, composition/SDS data, flash point and other properties, quantity, inner/outer pack, mode, and route. The determination must be retained by Product Variant and revisited on Formula or packout change.

If USPS is used, current Postal Service rules also control nonhazardous liquids. Current Publication 52 § 451.3 requires secure liquid packaging and triple packaging for specified nonmetal or breakable containers over 4 fluid ounces, including absorbent material sufficient for all liquid, a leakproof secondary, and a strong outer container ([USPS Publication 52](https://pe.usps.com/cpim/ftp/pubs/pub52/pub52.pdf)). Confirm the then-current publication and selected service at ship date. Other carriers can impose different contractual acceptance and packaging rules.

### 9.2 Glass needs system-level evidence

A frosted glass bottle or jar can pass component inspection and still fail distribution because the closure loosens, pipette strikes the wall, glass escapes a shipper, frosting abrades, a carton collapses, or liquid migrates after a drop. Test the **filled, closed, decorated, production-equivalent system**:

- exact Formula or a justified safe simulant at screening, followed by final Formula validation;
- every Mini and Full Size primary/closure assembly;
- retail carton/insert and orientation;
- exact DTC or case shipper, protective material, tape, and void fill;
- single-unit and expected multi-item packouts;
- hot/cold and low-pressure conditions relevant to the route;
- closure torque, leakage, glass breakage/containment, abrasion, label legibility, appearance, dose, and evacuation before and after testing; and
- worst-case heavy, tall, loose, or minimally protected configurations.

Define acceptance before testing: zero leakage, no closure back-off beyond limit, no glass escape, no loss of required label readability, no unacceptable decoration damage, and Product performance within approved limits.

### 9.3 Voluntary distribution standards

ISTA 3A is a general simulation for individual parcel shipments up to 150 pounds and includes atmospheric conditioning, shock, vibration, compression, and a liquid-leak test; ISTA states that retesting is appropriate after changes to Product, package, or process ([ISTA test procedures](https://www.ista.org/test_procedures.php); [ISTA design guidance](https://www.ista.org/getting_started_with_design.php)). ASTM D7386-25 is the current general simulation for single-parcel delivery systems up to 150 pounds ([ASTM D7386-25](https://store.astm.org/d7386-25.html)). ASTM D4169 remains a broader distribution-cycle practice and points single-parcel packages to D7386 ([ASTM D4169](https://store.astm.org/standards/d4169)).

These are voluntary until made contractual. They do not replace DOT classification, carrier rules, Formula compatibility, California obligations, or a route-specific risk assessment. The packaging engineer/test lab should select the protocol and assurance level from actual distribution data and document any modification.

## 10. Responsibility allocation

Contracts can allocate work, records, cost, and indemnity, but cannot erase a statutory role. Before RFQ release, the Legal Operator should assign named owners for this matrix:

| Party | Minimum owned outputs | Cannot be accepted as a substitute |
|---|---|---|
| **helix Legal Operator / label owner** | Final business identity and Responsible Person decision; Product Claim screen; unit/artwork approval; recall and lot architecture; supplier/change approval; record retention; California producer screening | Supplier's general compliance claim |
| **Responsible Person** | Monitored adverse-event contact; safety substantiation; serious-adverse-event and other MoCRA duties; label information under its name | A filler or agency performing clerical work |
| **Formula owner / ODM** | Formula identity, physical state, density/temperature behavior, safety and stability inputs, ingredient data, SDS/classification facts, compatibility cooperation | Package catalog rating |
| **Filler / packer** | Fill target and process validation; tare/net-content control; lot/batch traceability; torque/closure application; in-process/release testing; retains; actual component consumption | Empty component samples |
| **Primary/component suppliers** | Exact drawings/revisions, materials/layers, capacity/tolerance evidence, component weights, toxics certificates, site/tool/cavity identity, change notice, quality records | Marketplace listing or family-level certificate |
| **Decorator / converter** | Ink/coating/adhesive identity and certificates; cure/adhesion/abrasion evidence; legibility and change control | Undecorated substrate result |
| **Carton/tertiary/fulfillment suppliers** | Exact materials and weights; toxics certificates; dimensional/strength records; lot traceability; controlled substitutions | “Standard sustainable mailer” assertion |
| **Packaging engineer / independent lab** | Capacity protocol, compatibility test plan, transport protocol, production-equivalent verification, deviations, and signed results | Supplier self-attestation alone |
| **Hazmat professional / offeror / 3PL** | Formula and route classification, compliant packout/marking/documents when applicable, carrier acceptance, lot-preserving warehouse controls | Cosmetic status alone |
| **California regulatory counsel / SB 54 program owner** | Producer-tier determination; PRO/independent/exemption path; CMC/reporting position; SB 343 status; Proposition 65 and final artwork review | This public research report |

Purchase orders should flow the duties to the actual manufacturer, decorator, filler, packer, and logistics provider, including subcontractors. A trading company or distributor must disclose the physical site and preserve traceability to that site.

## 11. Stage gates and evidence pack

### Gate A — candidate intake

Reject or hold a candidate if any of these are missing:

- legal supplier entity, actual manufacturing site, and manufacturer/distributor status;
- dimensioned component and assembly drawings with controlled capacity definitions;
- exact materials, layers, colorants, coatings, inks, adhesives, and closure internals;
- printable area and physical samples for Mini and Full Size;
- per-component mass and plastic-component count for SB 54;
- signed California toxics-in-packaging certificates;
- resin-identification position for any qualifying rigid-plastic Big Size;
- change-control commitment and record-retention period; and
- no unsupported compliance or environmental claim carried into helix artwork.

### Gate B — label and quantity architecture

- classify the Product as cosmetic, not drug;
- freeze retail package layers and exact PDP geometry;
- select fluid measure or weight from final Formula evidence;
- select dual-unit nominal amount only after capacity/fill feasibility;
- budget all immediate/outer required information and optional claims;
- render/measure physical-size artwork;
- document slack-fill function for opaque voids; and
- obtain counsel/weights-and-measures approval.

### Gate C — component and process qualification

- inspect production-equivalent component lots against drawings;
- verify capacity, tare, dimensions, closure fit, and decoration;
- complete empty-pack and safe-simulant screens;
- complete final Formula compatibility, stability, preservation, dose, evacuation, and fill trials;
- validate target fill, statistical net-content control, torque/seal application, and lot code; and
- freeze golden samples and revision-controlled BOM.

### Gate D — California and claims release

- resolve SB 54 producer tier and compliance path;
- map every BOM component to current Covered Material Category guidance;
- approve or remove every environmental claim under FTC and current California rules;
- refresh SB 343 injunction, deadlines, current CalRecycle findings, and 2027 study status;
- complete Proposition 65 exposure determination; and
- confirm toxics certificates and any resin identification.

### Gate E — shipment release

- sign final Formula hazmat/nonhazmat determination for each mode;
- confirm carrier/USPS rules and service acceptance;
- pass filled production-equivalent distribution testing for each worst-case packout;
- preserve lot traceability through 3PL and shipment records; and
- retain deviations, results, photos, and release approvals.

## 12. Refresh triggers and unresolved facts

This baseline must be refreshed on any of the following:

- change to Product Claims, Formula, rheology, density, fragrance, alcohol/solvent, or transport classification;
- change to declared amount, Mini/Full dimensions, package material, supplier/site/tool, closure, liner, wiper, pipette, bulb, coating, ink, adhesive, label, carton, or shipper;
- addition/removal of a carton, leaflet, foreign language, environmental claim, online warning, or first-opening feature;
- change to named Legal Operator, Responsible Person, manufacturer/packer/distributor, importer, sales entity, PRO path, or fulfillment route;
- manufacture on or after an SB 343 deadline, a court-order change, CalRecycle study/table update, or the 2027 characterization study;
- SB 54 plan, regulation, CMC, fee/reporting, exemption, or producer-guidance update;
- Proposition 65 list, safe-harbor level, or warning-method update;
- new NIST Handbook 133 edition or confirmed California incorporation change;
- new carrier service, air leg, country, fulfillment center, or packout; or
- complaint, leakage, breakage, short-fill, decoration, recall, audit, or enforcement signal.

The following facts remain intentionally unresolved because packaging research cannot decide them alone:

1. the exact Legal Operator, Responsible Person, and California SB 54 producer;
2. final Product Claims and confirmation that all three Products remain cosmetics;
3. final Formula physical state, density, compatibility, shelf life, and transport classification;
4. the six declared quantities and the Mini label feasibility for exact components;
5. the California-incorporated quantity-testing edition at release;
6. whether any Proposition 65 exposure requires a warning;
7. whether future recyclability or other environmental claims can be substantiated; and
8. final carrier, route, test protocol, and packout.

Until those are resolved, supplier comparisons may screen capability and evidence, but no candidate is legally or technically approved for production.
