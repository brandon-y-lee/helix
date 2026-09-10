# Rhode editorial route supplement

Observed 2026-09-10. Independent supplement for the mobile parity audit. Scope: Rhode philanthropy and sustainability only.

## Evidence boundary

This supplement verifies page content from Rhode's official public pages. It does **not** verify mobile/desktop geometry, rendered ordering, scroll behavior, or control presentation. The assigned comparison was 390 × 844 mobile versus 1440 × 1000 desktop, but the research browser could not initialize: `createBrowserTab("iab")` returned “Browser is not available: iab”; `getState()` returned a startup failure; the eventual inventory exposed only the user's Chrome extension. Chrome was not used. No screenshots were captured, no forms submitted, and no remote mutations performed.

The shared browser session used by the parent consultant remains the appropriate place to close these two visual coverage gaps. Do not count content extraction as a completed visual audit.

## Philanthropy content inventory

The main content begins with foundation introduction, then four pillars: healthcare access, support for mothers/caregivers, business support, and emergency response. A featured maternal-support fund follows. The remainder comprises organization profiles and a wildfire relief feature, interleaved with photographs and outbound information links. Organization profiles include Girls Inc., birthFUND, Black Mamas Matter Alliance, Access Bridge, and Accion Opportunity Fund. [Official Rhode philanthropy page](https://www.rhodeskin.com/pages/philanthropy)

The extraction contains duplicated pillar content and repeated link labels. That is not evidence of visibly duplicated mobile sections; it may represent alternate markup or animation layers. Visual inspection must establish whether the pillars become stacked cards, a carousel, or disclosures, and how alternating image/text organization profiles reflow. [Official Rhode philanthropy page](https://www.rhodeskin.com/pages/philanthropy)

## Sustainability content inventory

The page contains an opening image/title, a planetary commitment statement, a three-part formulas/packaging/empties area, a shipping-packaging feature with supporting points and an outbound link, repeated decorative sustainability wording, and a closing product-packaging image/title. Images include portraits, product groups, cream texture, shipping packaging, and lip-treatment boxes. [Official Rhode sustainability page](https://www.rhodeskin.com/pages/sustainability)

The text extraction does not establish whether the three-part area is interactive, whether its images switch with labels, or whether mobile substitutes separate media crops. It also does not establish the arrangement of the repeated decorative words. Those are unresolved visual questions, not implementation instructions. [Official Rhode sustainability page](https://www.rhodeskin.com/pages/sustainability)

## Remaining visual checks

- At each assigned viewport, scroll every section through the footer and record main-content section order.
- Measure hero height, image/text proportion, gutters, typography wrapping, and spacing at transitions.
- Compare pillar/profile treatment on philanthropy, including whether controls appear only at narrow widths.
- Compare formulas/packaging/empties controls on sustainability, including their active and inactive states.
- Distinguish alternate crop assets from ordinary responsive image cropping.
- Verify footer layout and any sticky header behavior against the parent's shared-shell findings.

## Helix implication

Treat these as editorial layout references only. They provide no factual basis for Helix philanthropy, recycling, packaging, certification, donation, or sustainability claims. The mobile design spec should transfer only visually verified composition and interactions while retaining Helix's own factual content.
