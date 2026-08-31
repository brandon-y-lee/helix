# Substantiated Packaging Sustainability Scoring

- **Research ticket:** [#249 — Define substantiated packaging sustainability scoring](https://github.com/brandon-y-lee/helix/issues/249)
- **Research date:** 2026-08-31
- **Decision served:** convert packaging performance and supplier evidence into the sustainability portion of helix's packaging score without treating any material or format as inherently preferable.
- **Market:** United States direct-to-consumer, with California requirements treated as a distinct legal and system-performance layer.

> **Research recommendation, not legal advice or a consumer claim.** The score below is an internal procurement method. It does not establish that a package is “sustainable,” “green,” “recyclable,” lower carbon, or environmentally preferable. Final packaging and claims require current item-specific evidence, production-intent testing, and legal review in every market where the Product is sold.

## Executive decision

Use a **15-point, evidence-adjusted score** with six format-neutral dimensions:

| Dimension | Maximum points |
| --- | ---: |
| Material and cube efficiency | 3.0 |
| Product protection and usable yield | 2.5 |
| Verified recovered and traceable feedstock | 1.5 |
| Real-world recovery and stewardship | 4.0 |
| Manufacturing burden | 2.0 |
| Freight and loop-operation burden | 2.0 |
| **Total sustainability contribution** | **15.0** |

For every submetric, calculate a performance value from 0 to 1, then multiply it by an evidence-confidence factor from 0 to 1:

```text
sustainability points = sum(submetric weight × performance × evidence confidence)
```

This method creates four deliberate outcomes:

1. **No material wins by name.** Heavy glass must overcome mass, manufacturing, freight, and breakage burdens. Lightweight plastic must overcome weak real-world recovery where applicable. Laminate can receive Product-protection credit without being called recyclable. Fiber must justify every extra carton or insert. Reuse must win on achieved rotations after loss, cleaning, and reverse logistics—not on theoretical durability.
2. **Unknown is not zero impact; it is zero awarded credit.** Marketing copy, a sample that differs from production, an undated certificate, or a generic industry average cannot earn the same points as current SKU-, component-, site-, and lane-specific evidence.
3. **Safety, compatibility, legality, and quality are gates.** A leaking pack, an incompatible dropper, a contaminated refill loop, or an unlawful label cannot compensate with PCR or low mass.
4. **The internal score never becomes the claim.** “12.4/15” supports a purchasing decision only. Any public statement must be separately scoped and substantiated under the FTC Green Guides and applicable state law.

The immediate procurement recommendation is to score the cleanser, serum, and moisturizing cream **separately**, and to score each Product's Mini and Full Size as separate roles. Share evidence only when the component revision, material, decoration, manufacturing site, filling route, distribution route, and disposal instructions are actually identical.

## What is external fact and what is helix policy

The authorities do not publish a universal 15-point cosmetic-packaging score. The weights, confidence multipliers, comparison anchors, and governance rules in this report are therefore **helix policy recommendations**. They are informed by, but not represented as requirements of, the following primary-source frameworks:

- The GHG Protocol Product Life Cycle Standard requires a functional unit for a final product and describes it through the service, duration, and quality delivered. It also requires life-cycle boundaries and evaluates data for technological, temporal, and geographic representativeness, completeness, and reliability. [GHG Protocol Product Standard](https://ghgprotocol.org/sites/default/files/ghgp/standards/Product-Life-Cycle-Accounting-Reporting-Standard-EReader_041613_0.pdf)
- ISO 14044 covers LCA goal and scope, inventory, impact assessment, interpretation, limitations, reporting, and critical review. The paid standard is not reproduced here. [ISO 14044:2006](https://www.iso.org/standard/38498.html)
- The FTC Green Guides require a reasonable basis before an environmental claim, often competent and reliable scientific evidence, and require every reasonable express and implied interpretation to be truthful and not misleading. [16 CFR §§ 260.1–260.3](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260)
- California's current SB 54 regulations and Covered Material Category list separate collection, sortation, recycling rates, and responsible end markets; they also require quantified evidence for reuse/refill and source reduction. [SB 54 permanent regulations](https://www2.calrecycle.ca.gov/Docs/Web/138757) · [2026 Covered Material Category list](https://www2.calrecycle.ca.gov/Docs/Publications/137815)
- APR and How2Recycle evaluate more than base resin: design features, collection, sortation, reprocessing, and end markets can each change a package's recovery outcome. [APR Design Guide](https://plasticsrecycling.org/apr-design-hub/apr-design-guide-overview/) · [How2Recycle Decision Matrix](https://greenblue.org/2025/10/02/h2r-decision-matrix/)
- ISTA distinguishes a distribution test from proof of minimal packaging. It recommends distribution-representative tests, field monitoring, and a controlled “reduce to damage” or “pass with minimum margin” process when optimizing material. [ISTA sustainability guidance](https://www.ista.org/sustainability.php) · [ISTA test procedures](https://ista.org/test_procedures.php)

## Gate zero: qualify before scoring

A candidate enters the 15-point comparison only after all applicable gates pass. Record the test method, acceptance limit, sample count, package revision, formula batch, date, site, and approver for each gate.

| Gate | Minimum evidence | Failure treatment |
| --- | --- | --- |
| Formula compatibility | Production-intent formula/package study covering contact materials, extractables or migration questions where relevant, appearance, odor, viscosity, seal, actuator, and closure performance over the intended shelf life and stress conditions | Reject or hold; do not offset with sustainability points |
| Fill and use performance | Confirmed fill-line capability, net contents, torque/crimp/seal controls, dose output where applicable, ordinary evacuation, and accessible operation | Reject or redesign |
| Product protection | Applicable distribution simulation plus leak, drop, vibration, compression, thermal, and bathroom-use exposure; field confirmation before scale | Reject or redesign |
| Consumer and worker safety | Sharp-edge, shatter, contamination, refill sanitation, tamper, child-risk, and foreseeable misuse review as applicable | Reject or redesign |
| Legal and stewardship readiness | Producer/category classification, reporting path, current label review, and required records for each sales market | Hold until resolved |
| Claim substantiation | Claim register ties each final word, symbol, image, seal, resin code, and disposal instruction to current evidence and approval | Remove or qualify claim; never use score as evidence |

Passing an ISTA procedure is evidence of protection under that procedure, not proof that the pack is materially optimized. ISTA states that ordinary pass/fail tests establish lower performance limits but generally not upper limits; screening tests should be paired with field monitoring, and distribution-simulation tests are preferable for predicting field hazards. [ISTA](https://www.ista.org/sustainability.php)

## Comparable functional unit and system boundary

### Primary functional unit

For supplier and format selection, use:

> **1,000 compliant Product fills of the same Product, same size role, and same usable fill, successfully delivered through the ordinary helix DTC route at the required quality.**

“Usable fill” is nominal filled mass less measured ordinary residual, leakage, damage, and replacement loss. The reference flow includes every package and logistics input needed to deliver the 1,000 successful fills.

This is the decision unit because the package exists to deliver protected Product, not merely to place material on a filling line. It also prevents a fragile or poorly evacuating package from appearing efficient by ignoring replacement shipments or trapped formula.

### Supporting intensity views

Report these beside the score:

```text
packaging mass intensity = total packaging mass consumed / usable Product mass delivered

packaging-to-product ratio = total packaging mass consumed / usable formula mass delivered

distribution cube intensity = allocated packed volume moved / usable Product mass delivered

successful delivery yield = successful, usable units / filled units shipped

usable fill fraction = ordinarily evacuated Product mass / declared filled Product mass
```

Use both grams per successful filled unit and grams per 100 mL or 100 g of usable Product. The first reflects commercial handling; the second reveals whether a larger fill only looks efficient because it spreads one closure over more formula.

Do **not** rank a Mini against a Full Size on the same line. Mini and Full serve different trial, travel, regimen, value, and replenishment roles. Compare 30 mL serum candidates with other 30 mL serum candidates, for example, and retain the normalized intensity only as a portfolio view.

### Included boundary

Count all attributable packaging from component manufacture through the consumer-facing delivery and expected end-of-life:

- primary body, neck, shoulder, base, liner, plug, wiper, gasket, induction or pressure seal, closure, overcap, pump/dropper/pipette/actuator, label, adhesive, ink, lacquer, coating, metallization, and decoration;
- secondary carton, insert, leaflet, tray, sleeve, tamper device, bundle, and any replacement component;
- allocated master case, divider, pallet, slip sheet, stretch wrap, tape, inbound protective material, DTC mailer or box, void fill, tissue, and delivery label;
- damage replacements and the extra primary, secondary, tertiary, freight, and Product loss they cause;
- for refill/reuse, durable container production, refill packs or closures, return mailers, inspection, washing, drying, sanitation, rejected containers, replacements, and every forward and reverse leg.

Allocate shared cases and pallets by the physical driver that causes the burden: occupied case positions for dividers, mass for weight-limited transport, cube for volume-limited transport, and actual units per shipment for DTC packaging. Disclose the allocation rule and test alternatives in sensitivity analysis. Do not use one convenient allocation rule for every process.

### Reusable and refillable reference flow

Use observed cohort performance:

```text
achieved uses per durable container = completed compliant fill-use cycles / new durable containers introduced

loop burden per successful service =
  (durable-container production
   + all refill components
   + all replacement containers
   + forward and reverse transport
   + cleaning, inspection, and sanitation
   + damage and Product loss)
  / completed compliant fill-use cycles
```

Count a use only after the Product is successfully delivered and the container completes whatever return, refill, or reuse event the claimed system requires. Report the full cohort distribution—median, P10/P90, loss, damage, rejected-cleaning rate, and still-outstanding containers—not only an average. A design life of 20 cycles is not 20 achieved uses.

California's permanent SB 54 regulations require a reuse/refill plan to address durability, convenience, safety, environmental risks, and the **average number of uses or refills**; annual reporting must quantify the reduction in new material and the number and weight of plastic components. That is strong support for measured rotations rather than a durability claim alone. [SB 54 regulations, §§ 18980.8.1 and 18980.9.1](https://www2.calrecycle.ca.gov/Docs/Web/138757)

## The 15-point method

### Calculation

For candidate `k`:

```text
S_k = sum(w_j × p_j,k × c_j,k), for every submetric j
```

Where:

- `w` is the fixed submetric weight below;
- `p` is performance from 0.00 to 1.00 against pre-approved anchors;
- `c` is evidence confidence from 0.00 to 1.00;
- `S` is reported to one decimal place out of 15, while the worksheet retains full precision.

Never renormalize the available points when evidence is missing. A candidate without manufacturing data does not receive a smaller denominator; it receives no manufacturing credit until evidence arrives.

### Performance anchors

Before bids are opened, lock a **guardrail**, **reference**, and **target** for every quantitative submetric, separately for each Product and size role:

- **Guardrail:** the poor-performance boundary that earns 0.
- **Reference:** a qualified control or evidence-backed market benchmark that earns 0.5.
- **Target:** an ambitious but technically credible level that earns 1.

For a lower-is-better measure `x`:

```text
if x >= guardrail: p = 0
if reference <= x < guardrail:
  p = 0.5 × (guardrail - x) / (guardrail - reference)
if target < x < reference:
  p = 0.5 + 0.5 × (reference - x) / (reference - target)
if x <= target: p = 1
```

Reverse the direction for higher-is-better measures. Cap every result at 0 and 1.

This three-anchor method lets a qualified incumbent earn a neutral 0.5 instead of zero, while still rewarding meaningful improvement. Anchors must not be set from the best and worst bids after prices are visible; that lets the bidder pool redefine “good.” When no credible guardrail, reference, or target exists, mark the submetric **not yet scorable** and require a pilot. Do not invent a threshold to complete the spreadsheet.

### Evidence confidence

| Evidence class | Multiplier | Minimum meaning |
| --- | ---: | --- |
| **A — verified, specific** | **1.00** | Current evidence for the exact component/package revision, formula, factory or lane, and market; independent certification or testing where material; method, boundary, sample, and uncertainty are disclosed and traceable to production records |
| **B — supplier primary** | **0.75** | Current signed supplier or operator evidence for the exact proposed item/site/lane with underlying calculations or records, but not independently verified or not yet confirmed on a production lot |
| **C — modeled or categorical** | **0.40** | Credible government, standards-body, or disclosed industry data modeled with the candidate's actual mass and geometry, but not item/site/lane specific; or a production-intent sample before field validation |
| **D — unsupported** | **0.00** | Marketing copy, visual inference, a generic brochure, an unexplained logo, an expired or mismatched certificate, an unpublished assumption, a design goal, a theoretical reuse count, or a source that cannot be inspected |

Assess confidence per submetric, not once per supplier. A supplier can have Class A component weights and Class D freight data. Preserve source date, geography, technology, completeness, reliability, and revision because the GHG Protocol treats those as distinct data-quality properties. [GHG Protocol Product Standard, chapter 8](https://ghgprotocol.org/sites/default/files/ghgp/standards/Product-Life-Cycle-Accounting-Reporting-Standard-EReader_041613_0.pdf)

The confidence factor is a procurement rule, not a statistical confidence interval. If quantitative uncertainty is available, report it separately and compare the uncertainty in the **difference between candidates**, not merely two independent ranges. The GHG Protocol distinguishes parameter, scenario, and model uncertainty and recommends assessing uncertainty in the comparison itself. [GHG Protocol Product Standard, chapter 10](https://ghgprotocol.org/sites/default/files/ghgp/standards/Product-Life-Cycle-Accounting-Reporting-Standard-EReader_041613_0.pdf)

### Dimension 1 — material and cube efficiency: 3.0 points

| Submetric | Weight | Performance measure |
| --- | ---: | --- |
| Total package mass per functional unit | 1.75 | All primary, secondary, allocated tertiary, replacements, and reuse/refill inputs per 1,000 successful fills |
| Distribution cube per functional unit | 0.75 | Actual master-case, pallet, and ordinary DTC parcel cube allocated to the functional unit; identify whether each leg is mass- or cube-constrained |
| Avoidable components | 0.50 | Evidence-backed elimination of a carton, insert, overcap, platform, refill accessory, or other component without failing a gate |

Use measured component weights from production-intent samples and reconcile them to the supplier bill of materials and drawing. Record both the mean and range. A material name or percentage without grams cannot support this dimension.

The avoidable-component submetric is not a count contest. A necessary low-mass liner that prevents leakage can be preferable to its elimination. Award the point only when a comparative prototype removes the component and passes the same compatibility, filling, use, transit, labeling, and tamper requirements.

### Dimension 2 — Product protection and usable yield: 2.5 points

| Submetric | Weight | Performance measure |
| --- | ---: | --- |
| Successful delivery yield | 1.50 | Production-intent field rate after leaks, breaks, actuator failures, cosmetic damage that makes a unit unsellable, returns, and replacements; applicable distribution simulation is required before field evidence |
| Ordinary evacuation | 1.00 | Median and P10/P90 usable fill fraction after the written ordinary-use protocol; do not cut open, rinse, or use extraordinary tools unless that is the intended consumer method |

Count replacement units and Product loss in the functional-unit denominator and relevant burdens. A heavier jar cannot justify itself merely by saying glass protects Product; it must show the measured difference. A high-barrier laminate should not receive recovery points it has not earned, but it can receive protection and evacuation points when the exact formula/package evidence supports them.

Run the appropriate ISTA distribution simulation for the actual route, then confirm through field monitoring. For DTC parcel or retailer fulfillment, ISTA identifies procedures such as 3A, 3L, and the applicable member-performance routes; the correct protocol depends on the actual distribution system and package. Retest after meaningful Product, package, material, closure, or process changes. [ISTA selection guidance](https://www.ista.org/getting_started_with_design.php) · [ISTA 3L](https://ista.org/ista3l.php)

### Dimension 3 — verified recovered and traceable feedstock: 1.5 points

| Submetric | Weight | Performance measure |
| --- | ---: | --- |
| Post-consumer recovered content | 0.75 | Mass-weighted verified PCR fraction across all included packaging components |
| Other recovered content | 0.25 | Mass-weighted verified pre-consumer content that otherwise would have entered the waste stream; exclude routine in-process regrind returned to the same process |
| Chain of custody for remaining feedstock | 0.50 | Material-appropriate, transaction-linked chain of custody covering the proposed input; for fiber, current FSC claim, certificate scope, invoice, and label/trademark eligibility |

Calculate recovered content as:

```text
total PCR fraction = sum(component mass × component PCR fraction) / total included packaging mass

total eligible pre-consumer fraction =
  sum(component mass × eligible pre-consumer fraction) / total included packaging mass
```

Also report primary, secondary, and tertiary results separately so a heavy corrugated shipper does not hide virgin primary packaging. Keep PCR and pre-consumer values separate in the worksheet even if a final qualified claim combines them.

The FTC treats recycled-content percentage as a weight-based claim. Pre-consumer material must otherwise have entered the waste stream; normal in-process scrap routinely returned to the process is not recycled content. An unqualified claim implies the entire Product or package, except minor incidental components, is recycled material. [16 CFR § 260.13](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260/section-260.13)

California's SB 54 regulations require accurate assumptions and supporting data for PCR-based source-reduction credit and identify APR's PCR certification or an independently accredited, at-least-as-stringent alternative as validation routes. They also cap PCR credit so it cannot exceed the credit from eliminating the material. This supports helix's decision to reward PCR but keep material elimination and efficiency distinct. [SB 54 regulations, § 18980.3.4](https://www2.calrecycle.ca.gov/Docs/Web/138757)

FSC Chain of Custody is evidence about forest-based sourcing, processing, labeling, and sale; it is not proof of recyclability, low carbon, or overall environmental superiority. For finished-product promotion, FSC says the Product must be directly sourced and invoiced by an FSC-certified company, within certificate scope, and properly labeled. A copy of the supplier's certificate alone is insufficient; transaction documents must carry the claim and certificate number. [FSC CoC standard](https://open.fsc.org/handle/resource/302) · [FSC promotional-use requirements](https://us.fsc.org/promotional-use)

Do not double-count the same recycled fiber under PCR, pre-consumer, and FSC. PCR/pre-consumer points reward recovered mass. Chain-of-custody points reward traceability for the material claim and remaining feedstock.

### Dimension 4 — real-world recovery and stewardship: 4.0 points

| Submetric | Weight | Full-credit question |
| --- | ---: | --- |
| Collection access | 0.75 | Is the finished item accepted through an established route for the actual sales footprint, not merely accepted as a base material in theory? |
| Sortation | 0.75 | Does the exact size, shape, color, label coverage, decoration, density, and sensor response sort to the intended stream? |
| Reprocessing compatibility | 0.75 | Do resin/material, closure, liner, adhesive, ink, coating, barrier, metallization, residue, and additives survive the intended reprocessing specification without materially degrading the stream? |
| Responsible end market | 0.75 | Is there current evidence that recovered output reaches a legitimate manufacturing market with measured yield rather than only being collected or sold? |
| Actual capture or completed reuse | 0.75 | What percentage of units is verifiably captured and recycled, or completes a qualifying return/refill/reuse cycle, after contamination and loss? |
| Consumer preparation and separability | 0.25 | Can an ordinary consumer perform every required emptying, rinsing, separation, return, or refill step; are instructions clear and behavior measured? |

For each 0.75-point stage, assign performance before the confidence factor:

- **1.00:** exact-item evidence shows the stage succeeds across the intended footprint and route;
- **0.75:** exact-item technical evidence succeeds and current system evidence covers a substantial but not complete footprint;
- **0.50:** category evidence is favorable, but exact-item or downstream-yield evidence is incomplete;
- **0.25:** limited/local/pilot route with measured results and prominent geographic or program limits;
- **0.00:** the stage fails, has no responsible downstream route, or is unsupported.

For the 0.25-point consumer-preparation line, use the same 0–1 scale. Weight components separately only when they are detachable and ordinary consumers demonstrably separate them. If a pump, dropper collar, metallized label, coating, pigment, or barrier can cause the whole item to fail sortation or reprocessing, do not average the failure away by its small mass.

APR evaluates package features including base resin, color, size, closures and dispensers, barriers, coatings, additives, labels, adhesives, inks, and attachments. It provides test protocols for unknown sortation or recyclability effects. That supports exact-package testing rather than a “mono-material” shortcut. [APR Design Guide](https://plasticsrecycling.org/apr-design-hub/apr-design-guide-overview/)

#### Why technical recyclability is insufficient

The FTC allows an unqualified recyclable claim only when appropriate facilities are available to at least 60% of consumers or communities where the item is sold. Below that threshold, the claim must be qualified with increasing strength. The entire item, apart from minor incidental components, must qualify; a component or feature that significantly limits recycling can make the claim deceptive. [16 CFR § 260.12](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260/section-260.12)

Access still is not actual recovery. EPA's 2024 national assessment says only 15% of states and territories collect community-program capture rates and 88% do not collect data on the types of single-use plastics in commerce. EPA also estimates $36.5–43.4 billion is needed to modernize U.S. recycling infrastructure across collection, sorting, processing, and end markets. [EPA U.S. Recycling Infrastructure Assessment](https://www.epa.gov/smm/us-recycling-infrastructure-assessment-and-state-data-collection-reports)

Use EPA's 2018 national packaging rates only as stale, aggregate directional evidence: the page itself identifies the data year. It reports 31.3% for glass containers, 13.6% for plastic containers and packaging overall, 29.1% for PET bottles/jars, and 29.3% for natural HDPE bottles. These figures do not establish any current cosmetic item's recyclability. [EPA Product-specific packaging data](https://www.epa.gov/facts-and-figures-about-materials-waste-and-recycling/containers-and-packaging-product-specific)

#### California is a distinct evidence layer

California SB 343 prohibits chasing arrows and other recyclability indicators unless statutory criteria are met. CalRecycle's current page says the labeling restrictions apply to products and packages manufactured after **October 4, 2026**, while also stating that a July 14, 2026 federal preliminary injunction blocks enforcement and may affect that deadline. The injunction does not turn an unsupported claim into a substantiated one; it also does not stop CalRecycle's 2027 study update. CalRecycle does not decide the recyclability of an individual package—the producer must assess and substantiate it. [CalRecycle SB 343](https://calrecycle.ca.gov/wcs/recyclinglabels/)

California's January 2026 SB 54 category list is more current and more form-specific than national 2018 data, but it also has limits: categories apply to detachable components individually, the category determination does not decide whether a specific item may bear a label, and the reported recycling amount did not yet test responsible end markets because those markets had not been identified for the Act. [2026 CMC list](https://www2.calrecycle.ca.gov/Docs/Publications/137815)

Useful current California category signals include:

| Category signal, not an item verdict | Estimated 2024 recycling rate in the 2026 CMC list |
| --- | ---: |
| Glass bottles and jars | 65% |
| Aluminum non-aerosol containers | less than 39% |
| Aluminum foil and other forms | less than 9% |
| OCC cardboard | 68% |
| Paperboard | 30% |
| Clear/natural PET bottles, jugs, and jars | 16% |
| Pigmented PET bottles, jugs, and jars | 5% |
| Natural or pigmented HDPE bottles, jugs, and jars | 19% |
| LDPE flexible and film items | 5% |
| PP bottles, jugs, jars, and other rigid containers | 2% |

Do not assign a tube, jar, dropper, pump, coated carton, or small component to one of these rows by visual inspection. Use the current CMC guidance, exact dimensions and construction, and item-specific evidence. A “yes” category determination reflects collection and sortation assumptions, not necessarily responsible end-market yield. [2026 CMC list](https://www2.calrecycle.ca.gov/Docs/Publications/137815)

SB 54's permanent regulations require annual verification of responsible end markets, including accepted material, successfully recycled output, and recycling yield. Material sent to a market that no longer meets the standard does not count as recycled for the Act. This is the strongest reason to reserve separate points for end markets and actual yield. [SB 54 regulations, § 18980.4.2](https://www2.calrecycle.ca.gov/Docs/Web/138757)

### Dimension 5 — manufacturing burden: 2.0 points

| Submetric | Weight | Performance measure |
| --- | ---: | --- |
| Cradle-to-gate climate burden | 1.25 | kg CO2e for all package components needed per functional unit, using a common system boundary, allocation method, electricity year, recycled-content method, and global-warming-potential basis |
| Other measured production burdens | 0.75 | Comparable nonrenewable energy, process water, and manufacturing loss or waste for the same components and boundary; score only metrics available on a harmonized basis for all finalists |

Supplier-specific product carbon footprints, EPDs, or life-cycle inventories should identify the exact factory, process, material grade, decoration, allocation, data year, Product system, exclusions, and assurance. A corporate carbon total, “renewable-powered” statement, resin trade-association average, or unrelated package EPD is not component-specific evidence.

If finalists report different environmental indicators, databases, electricity mixes, recycled-material allocation methods, or end-of-life assumptions, do not place the headline numbers in the same scoring column. Recalculate from disclosed inventory data using one method or commission one comparative study. The GHG Protocol Product Standard supports performance tracking but explicitly says its results alone do not support public comparative assertions of overall environmental superiority; additional specifications are required. [GHG Protocol Product Standard](https://ghgprotocol.org/sites/default/files/ghgp/standards/Product-Life-Cycle-Accounting-Reporting-Standard-EReader_041613_0.pdf)

EPA's current WARM Version 16 can screen source-reduction and waste-management scenarios, but it is not a supplier-, coating-, factory-, shape-, or Product-specific packaging LCA. Use WARM as Class C evidence, disclose the proxy and data limitations, and never replace a production-intent inventory with a generic material factor. [EPA WARM versions](https://www.epa.gov/waste-reduction-model/versions-waste-reduction-model) · [WARM Version 16 packaging documentation](https://www.epa.gov/system/files/documents/2023-12/warm_containers_packaging_and_non-durable_goods_materials_v16_dec.pdf)

Do not automatically credit renewable-energy certificates, bio-based feedstock, or “plant-based plastic” here. Record the accounting instrument, ownership, time period, site coverage, and every reasonable implied claim. Under the FTC Guides, an unqualified renewable-energy claim is deceptive if fossil fuel contributes materially to manufacture unless properly matched, and selling the renewable attributes can preclude claiming their use. Renewable-material claims should identify the material and why it is renewable and must not imply unrelated attributes such as recyclability. [16 CFR §§ 260.15–260.16](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260)

### Dimension 6 — freight and loop-operation burden: 2.0 points

| Submetric | Weight | Performance measure |
| --- | ---: | --- |
| Component and finished-goods freight | 1.00 | Carrier- or lane-specific emissions for raw component delivery, decoration, filling, warehousing, and finished-goods movement per functional unit |
| DTC, reverse, and cleaning operations | 1.00 | Ordinary parcel delivery plus reshipments; for reuse/refill, every return leg, mailer, consolidation step, wash, dry, sanitation, inspection, reject, and refill operation per successful service |

At minimum, retain for every leg:

- origin, destination, actual or defensibly routed distance, mode, carrier, service level, shipment mass, chargeable or dimensional weight, cube, pallet or parcel utilization, temperature control, and empty/repositioning treatment;
- component and formula mass separately, so a lighter package cannot claim the Product's unavoidable freight reduction;
- air, ocean, rail, truck, parcel, courier, and reverse movements rather than a single blended “freight” factor;
- carrier-specific emissions when available, with generic modal factors clearly labeled and confidence-discounted.

For a mass-based leg:

```text
freight emissions = shipped tonnes × distance × carrier- or mode-specific emissions factor
```

This is not sufficient for every parcel or cube-limited load, so also model the carrier's actual allocation method and utilization. EPA SmartWay provides carrier and modal metrics such as CO2 grams per mile and grams per ton-mile and recommends representative carrier data over illustrative modal averages. Its shipper tool can evaluate mileage, weight, load, carrier, and modal changes; future versions may expand ocean capability. [EPA SmartWay technical documentation](https://www.epa.gov/system/files/documents/2024-11/420b24048.pdf) · [SmartWay accounting guidance](https://www.epa.gov/smartway/how-smartway-supports-corporate-social-responsibility-csr-and-sustainability-reporting)

For cleaning, measure metered water, temperature, energy, detergent or sanitizer dose, rejected batches, wastewater route, drying, and labor/throughput constraints during the pilot. A generic household-washing assumption is not evidence for a commercial loop. Reverse **postage** belongs in the reuse total-cost model below; its physical shipment burden belongs in this dimension.

## Reuse and refill: environmental and economic break-even

Reuse is a system, not a container attribute. A durable jar earns no reuse credit if consumers retain it indefinitely, discard it after one fill, or cannot obtain a compatible refill. The FTC says a refillable claim requires an actual collection/refill system or a Product sold to refill the original package; a durable design without a means to refill is insufficient. [16 CFR § 260.14](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260/section-260.14)

### Cohort metrics

For each launch cohort and time window, report:

```text
return rate = returned eligible containers / containers expected to return by cutoff

successful return rate = containers accepted after inspection / containers expected to return

completed rotation = one compliant fill delivered and its container completed the defined loop event

achieved rotations per new durable = completed rotations / new durable containers introduced

loss rate = containers written off as unreturned, damaged, contaminated, or uneconomic to recover

cleaning yield = containers accepted for refill / returned containers entering cleaning
```

Define “expected to return” with a fixed cohort-maturity rule; do not improve the rate by leaving overdue units in an indefinite pending state. Show first-to-second rotation retention separately because early drop-off can dominate the average.

### Environmental break-even

For any environmental burden `B` measured on the same basis:

```text
B_one-way = burden of one complete single-use service

B_durable_initial = burden to make the durable container and its first-use accessories

B_each_loop = burden of refill components + forward/reverse freight + cleaning + inspection

theoretical break-even rotations =
  (B_durable_initial - B_one-way) / (B_one-way - B_each_loop)
```

This equation is meaningful only when `B_one-way > B_each_loop`, boundaries are identical, and losses/replacements are included. It is a scenario threshold, not a score. A reuse system earns points from achieved cohort performance through all six dimensions. Report low-return, expected, and high-return scenarios, and do not claim a benefit until achieved rotations clear break-even with a reasonable uncertainty margin.

Run the break-even separately for climate, material mass, water, and any other material impact. One system can reduce packaging mass but increase transport emissions or water use. Do not collapse unlike impacts into a single “times better” claim.

### Reuse-loop economics

Keep cost outside the 15 sustainability points so price is not mistaken for environmental performance, but require a parallel total-cost result:

```text
reuse TCO per successful service =
  (durable-container acquisition
   + refill components and filling
   + forward fulfillment
   + reverse postage and consolidation
   + cleaning, drying, sanitation, and inspection
   + replacements and write-offs
   + customer incentives and support
   + program technology and administration
   + EPR/stewardship fees)
  / completed compliant fill-use cycles
```

Compare this with the same boundary for the qualified one-way control. Show cash timing, working inventory trapped in the loop, deposits and refunds, loss assumptions, postage zones, labor, cleaning capacity, and sensitivity to cohort retention. A low unit price for the durable container does not rescue a loop with high loss or reverse-postage cost.

## How the method treats helix packaging archetypes

This is a trade-off map, not a pre-score. Each statement about a candidate must be replaced with exact BOM, testing, logistics, and current end-of-life evidence before award.

| Archetype | Potential strengths to prove | Burdens and failure modes to measure | Evidence needed before scoring |
| --- | --- | --- | --- |
| Frosted glass serum bottle or cream jar | Chemical compatibility, stiffness, premium reuse potential, current California glass-bottle/jar category signal, recycled cullet availability | High mass, energy, parcel cube, drop/shatter and bathroom risk, replacement Product loss, frosting/coating compatibility, closure and pipette as separate materials | Exact glass mass/color/cullet; coating and decoration; drop/transit/field breakage; closure/dropper BOM and separability; exact CMC/item analysis; site LCA; filled lane data |
| Lightweight PE or PP tube/container | Low mass, high cube efficiency, good evacuation or resilience when designed well, PCR potential | A technically compatible resin does not prove collection or actual recovery; tube form, small components, dark color, label, cap, barrier, and residue can change outcome | Exact resin/layers/form/dimensions; APR or equivalent sort/reprocess testing; current collection and actual-rate evidence; PCR chain of custody; evacuation; cap/body ordinary separation |
| Aluminum collapsible tube | Product protection, low residual through permanent collapse, possible recycled input | Production burden, internal lacquer, cap/shoulder, crimp residues, small or “other form” recovery, dent/puncture, exact category ambiguity | Alloy/recycled input, liner and cap BOM, tube-form collection/sort/reprocess evidence, current California item/category determination, residual and damage data, manufacturing energy |
| Plastic or foil laminate tube/pouch | Barrier, lightweighting, compatibility, low freight, potential Product-loss prevention | Mixed layers, foil/metallization, adhesives and closures can prevent ordinary separation and reprocessing; “mono-material” marketing may omit functional layers | Full layer stack by mass, adhesive/barrier/decoration, exact reprocessing test, route/access/end-market evidence, protection delta versus recyclable alternative |
| Fiber carton, shipper, or insert | Renewable/recovered feedstock, print surface, product protection, efficient rectangular handling; FSC chain-of-custody opportunity | May be unnecessary; coating, lamination, metallic decoration, adhesives, windows, and inserts add material and can change recovery; paperboard is not OCC | Need/avoidance A/B test, board grade and mass, recycled content, transaction-linked FSC claim, coatings/inks/adhesives, exact category, parcel damage and cube |
| Refillable or returnable system | Can amortize durable packaging and avoid one-way components if consumers complete enough rotations | Low return, breakage/loss, cleaning rejects, sanitation, reverse postage, duplicated refill packaging, inventory, customer friction, extra freight | Cohort returns and achieved rotations; refill BOM; loop LCA; metered cleaning; actual lanes; inspection/reject data; TCO; consumer-comprehension study |

### Why the obvious shortcuts fail

- **Heavy glass is not automatically premium sustainability.** Its category may have stronger recovery evidence than some plastics, yet an exact coated cosmetic pack still carries mass, manufacturing, closure, freight, and breakage consequences.
- **PCR is not a free multiplier.** A 30% PCR package that is twice as heavy can use more virgin material than a lighter virgin control. Report absolute virgin grams, total mass, and PCR fraction.
- **“Mono-material” is not an end-of-life result.** Color, label coverage, coating, additive, barrier, closure, geometry, residue, sortation, access, and markets remain relevant.
- **A resin code is not the score.** Under FTC guidance, a conspicuous resin identification code can itself communicate a recyclable claim; it needs the same claim review.
- **FSC does not make an unnecessary carton necessary.** First ask whether the component can be eliminated, then evaluate its fiber sourcing.
- **Reuse is not theoretical design life.** Only achieved services, including loss, cleaning, reverse logistics, and refill packaging, enter the denominator.
- **A mail-back page is not proof of recycling.** Measure accessibility, participation, contamination, successful reprocessing, and responsible output markets.
- **A transit-test pass is not proof of minimum material.** Optimize with controlled comparative testing and field evidence.

## Green-claim boundaries

### Governing federal principles

The current Green Guides are FTC administrative interpretations, not independently enforceable regulations; Section 5 of the FTC Act prohibits unfair or deceptive practices. The Guides apply to consumer and B2B marketing across words, symbols, logos, images, and implied claims. They do not preempt stricter state law, and compliance with a state law does not bar an FTC challenge. [15 U.S.C. § 45](https://www.govinfo.gov/link/uscode/15/45) · [16 CFR § 260.1](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260/section-260.1)

As of this research date, the current eCFR still contains the 2012 Green Guides. The FTC's 2022 review asked about recyclability thresholds, actual recycling, mass-balance recycled content, compostability, climate, and “sustainable” claims; those questions did not amend the current text. [FTC Green Guides page](https://www.ftc.gov/legal-library/browse/rules/green-guides) · [2022 review notice](https://www.federalregister.gov/documents/2022/12/20/2022-27558/guides-for-the-use-of-environmental-marketing-claims)

### Claim-control table

| Proposed claim or signal | Required boundary | Do not infer |
| --- | --- | --- |
| “Sustainable,” “green,” “eco-friendly,” leaf/globe/forest imagery, or an unexplained environmental seal | Avoid an unqualified broad claim. If used at all, qualify to specific material benefits, assess trade-offs and net impression, and substantiate every reasonable implication | No negative impact; overall superiority; carbon, toxicity, sourcing, recovery, or circularity not expressly proven |
| “Recyclable,” chasing arrows, Möbius loop, “please recycle,” or prominent resin code | Exact finished item; actual sales footprint; current collection threshold; sortation, reprocessing, and limiting components; stronger qualification as access falls; California item-specific review | Base material alone does not establish the claim; “where facilities exist” is not enough below the FTC threshold |
| “Contains X% recycled material” | Percentage by weight, exact Product/package or named component, PCR versus eligible pre-consumer where stated, production loss, period and chain of custody | Recyclable; lower carbon; zero waste; physical PCR under an unsupported book-and-claim system |
| “Refillable” or “reusable” | Actual system or compatible refill Product, defined return/refill route, achieved uses, sanitation and consumer instructions | Durable appearance or technical capability alone |
| “X% less plastic/waste” or “lighter” | Exact amount, weight or volume metric, named previous package or comparison, frozen component boundary, date, fill equivalence, and calculation | Overall environmental improvement; less total waste if only one component changed |
| FSC name or logo | Exact finished fiber component, valid scope, transaction claim/certificate number, label/trademark approval, direct source and invoice where required | Recyclability, recycled content unless claimed, carbon superiority, or whole-package certification |
| “Mono-material” | Full material stack and mass, accepted technical definition, closure/label/barrier treatment, and no implied recyclability unless separately proven | Collection, sortation, end market, or actual recycling |
| “Compostable” | All materials, timely safe conversion, home versus facility route, access and current law; exact certification/test scope | Landfill degradation, recyclable, litter-safe, or home compostability from industrial certification |
| “Biodegradable” or “degradable” | Customary disposal environment, complete breakdown, rate and extent; the FTC one-year condition for unqualified solid-waste claims | Fragmentation, microplastic formation, or eventual degradation over an indefinite period |
| “Lower carbon” or “X% lower emissions” | Same functional unit, boundary, method, data period, allocation, uncertainty, and named comparison; independent review proportional to the claim | Overall environmental superiority or unrelated water, toxicity, waste, sourcing, or recovery benefits |

The FTC says broad unqualified general-benefit claims are difficult or impossible to substantiate and that a specific explanation cannot cure a deceptive overall context. Seals and certifications do not replace the marketer's substantiation duty, and the basis of a seal must be clear. [16 CFR §§ 260.4 and 260.6](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260)

For compostable claims, all materials must safely become usable compost in a timely manner, and limited facility access requires qualification. For unqualified degradable claims on solid-waste items, the item must completely break down within one year after customary disposal; packages customarily landfilled, incinerated, or recycled generally do not meet that condition. [16 CFR §§ 260.7–260.8](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-260)

### Claim-file rule

Maintain a dated claim file for every final Product/package revision containing:

- final artwork, PDP copy, icons, imagery, disposal instructions, influencer brief, and every reasonably implied claim;
- the exact component or whole package named;
- BOM, weights, calculations, supplier declarations, certifications, tests, access and actual-rate data, geography, comparison baseline, and uncertainty;
- legal and technical approvals, effective date, review date, change controls, and the condition that triggers re-review.

The scorecard may be attached as internal decision context, but it is never the claim's substantiation by itself.

## Supplier evidence package

Require the same structured return from every supplier at the 1,000–3,000-unit primary-container MOQ band. A “not available” answer is preferable to a guessed value and receives Class D confidence until replaced.

### Component and construction

- part number, revision, ownership/tooling status, dimensions and tolerances;
- exploded drawing and complete BOM for body, closure, actuator/dropper/pipette, liner, gasket, seal, label, adhesive, ink, lacquer, barrier, coating, metallization, colorant, and attachments;
- material grade, supplier, manufacturing country and site, process, component mass mean/range, finished-package mass, and production scrap rate;
- Mini and Full data separately, including any apparently shared closure whose dose, mass, or fit differs;
- expected MOQ, setup loss, production yield, sample-to-production changes, and change-notification period.

### Recovered content and traceability

- exact PCR and eligible pre-consumer percentage by weight for each component and whole package;
- whether values are physical segregation, controlled blending, mass balance, or certificates/credits; calculation and production period;
- resin, cullet, metal, or fiber transaction records and third-party verification;
- for FSC, current certificate scope, invoice claim, certificate number, label approval, and helix promotional eligibility;
- virgin grams and recovered grams per successful functional unit, not percentage alone.

### Recovery and stewardship

- proposed CMC or other applicable category for every detachable component, with the rationale and current date;
- item-specific collection/access evidence for the actual U.S. footprint and California separately;
- sortation and reprocessing results for the exact geometry, color, label, closure, coating, and residue condition;
- APR, How2Recycle, mill, glass processor, metal processor, or equivalent current assessment with every limitation and required consumer preparation;
- responsible end markets, accepted input, output yield, contamination, fate of rejects, and actual capture/recycling rate;
- take-back operator coverage, participation, return postage, collected mass, sorting loss, recycled output, and downstream customers.

### Protection and use

- formula-compatibility protocol and results on the exact decorated pack;
- fill, seal, torque/crimp, dropper/pump output, leakage, evacuation, and residual data;
- relevant ISTA or equivalent distribution simulation, sample count, failures, package revision, laboratory, and field-damage data;
- DTC damage, leakage, breakage, reshipment, return, complaint, and Product-loss history for comparable exact formats, clearly labeled if not the proposed item.

### Manufacturing and logistics

- component-level cradle-to-gate inventory, PCF, or EPD with system boundary, site, technology, data year, electricity, allocation, recycled-content method, exclusions, uncertainty, and assurance;
- energy source and consumption, process water, manufacturing loss/waste, recovery route, solvent/coating controls, and relevant restricted-substance declarations;
- origin-to-filler and filler-to-warehouse lane, mode, distance, carrier, service, pallet/case pack, utilization, mass, cube, and freight-emission method;
- DTC parcel dimensions, dimensional weight, ordinary items per parcel, void fill, damage replacement, and returns;
- for reuse/refill, every reverse leg plus metered cleaning, drying, sanitation, inspection, reject, refill, and replacement inputs.

### Commercial loop evidence

- one-way and reuse/refill TCO on the same boundary;
- expected and achieved cohort return rate, time to return, rotations, loss, damage, cleaning yield, and outstanding inventory;
- reverse postage by zone and service, consolidation, deposits/incentives, customer-service burden, technology/administration, working inventory, and EPR fees;
- low-return, expected, and high-return sensitivities and environmental/economic break-even.

## Procurement worksheet and decision rule

Use one row per submetric and retain both raw and adjusted results:

| Field | Required entry |
| --- | --- |
| Candidate and exact revision | Supplier, part, size, decoration, factory, formula, and date |
| Functional unit and boundary | Product/size role, fill, usable-fill method, channel, included components and allocations |
| Metric | Name, unit, direction, guardrail, reference, target, and why those anchors were approved |
| Candidate value | Central value, range/uncertainty, sample, method, and assumptions |
| Raw performance | `p`, 0–1 |
| Evidence class | A/B/C/D and `c` multiplier |
| Adjusted points | `w × p × c` |
| Source pointer | Controlled file, certificate, test, invoice, dataset, or public URL |
| Gap and next action | Evidence owner, due date, pilot or test needed, and claim consequence |

Example of mechanics only: if a 0.75-point sortation submetric has `p = 0.80` and exact supplier evidence is Class B (`c = 0.75`), it earns `0.75 × 0.80 × 0.75 = 0.45` point. This is not a package assessment.

Rank candidates by adjusted score only after every gate passes and each finalist has the same boundary. Also show:

- raw performance score before confidence;
- points lost to evidence confidence;
- category-by-category score, so unlike trade-offs are visible;
- absolute packaging mass, virgin mass, PCR mass, successful delivery, residual, actual recovery, kg CO2e, freight, and TCO—not only points;
- uncertainty and the sensitivity to return rate, damage, electricity, freight mode, allocation, and end-of-life assumptions.

If two finalists are close enough that uncertainty could reverse their order, call the result **indeterminate** and run the test that most reduces decision uncertainty. Do not choose the candidate with more decimal places.

## Governance and refresh cadence

1. **Version the method.** Store the scorecard version, weights, anchors, calculation workbook, source dates, and approvers with each decision.
2. **Lock before bids.** Approve gates, functional unit, boundary, anchors, and evidence rules before seeing candidate prices or environmental claims.
3. **Separate duties.** Procurement collects; packaging/formulation validates compatibility and performance; sustainability validates inventory and recovery evidence; legal approves claims.
4. **Verify production.** Reconcile the awarded sample and first production lot to drawings, BOM, weights, PCR/FSC transaction records, decoration, factory, and tests.
5. **Control changes.** Re-score after a material, layer, pigment, coating, adhesive, closure, supplier, factory, fill, secondary/tertiary pack, lane, disposal instruction, or reuse-loop change.
6. **Refresh system evidence annually and before claims.** California's SB 54 CMC list updates annually through 2032; SB 343's next study is due in 2027; U.S. access, end markets, and program acceptance can change faster than component tooling.
7. **Audit claims separately.** A procurement win does not authorize an environmental claim. Re-review final net impression, scope, evidence, geography, and dates.
8. **Retire stale evidence.** Certificates must be valid at purchase; transaction claims must match the ordered material; supplier and carrier data must represent the production period.

## Recommended operating position for the core three

For the first cleanser, serum, and moisturizer supplier round:

- issue the structured evidence package with both Mini and Full RFQs;
- establish a qualified reference pack and three-anchor thresholds for each of the six Product/size roles;
- keep at least one lightweight and one premium-feel architecture alive until compatibility, evacuation, transit, and landed-lane data exist;
- require exact component weights and construction before assigning any sustainability points;
- treat government category rates as Class C until exact-item collection, sortation, reprocessing, and end-market evidence is obtained;
- make the first supplier down-select conditional if manufacturing, freight, or field-yield evidence is still modeled;
- run a reuse/refill pilot only with a defined operational owner, return route, cohort measurement, sanitation method, and stop/go thresholds; do not market the future loop before it exists.

The defensible result is not “glass versus plastic.” It is a transparent record of how much verified packaging, virgin material, freight, Product loss, and real disposal burden each qualified system requires to deliver the same usable skincare service—and how certain helix is about every number.
