# Super Serum copy correction — candidate 1

User clarified the ellipsis was editorial direction, not literal copy, and requested lowercasing step/for. Parent requests exact title `One step for Longevity`, complete prior description with PDRN in the opening, no new claims, and all other section changes retained. Local only; base7e8b4be.

Source: `36e4df7:components/home/HomeSuperSerumSpotlight.tsx`, inspected before editing. Resulting title `One step for Longevity`. First paragraph exactly: `A lightweight serum with PDRN, humectants, niacinamide, peptides, and adenosine for hydrated, supple-looking skin.` Second paragraph exactly: `The treatment layer of The Core. Use after cleansing and before moisturizer, morning and night.` This restores both existing paragraphs while moving PDRN after “serum with”; no ingredient/application/efficacy additions.

Change component copy only and existing homepage exact-copy/title/missing-product assertions. CSS/image/eyebrow/CTA/canonical destination/guard/other sections unchanged. No new test; update existing assertions. Verify24focusedtests/lint/typecheck/build, exact rendered strings and wrapping/overflow/focus at1440/390/320, native product destination unaffected. Record independent plan/code reviews, commit/prepare, keep preview3100 running. No push/deployment/Library writes or full integration claim.
