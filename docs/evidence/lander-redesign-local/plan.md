# Local landing-page redesign candidate — revision 1

Goal source: user's 2026-11-08 landing-page request, room message Sentinel_c49558998b6c8191abeb3cf86fafbc68. Local review only; no issue publication, push, PR, merge, deployment, provider configuration or data mutation authorized.

Base: dev 830a3975154b4554bf2d7dbdba713eb2c4d96a46. Isolated worktree /tmp/helix-lander-review; branch codex/plan-lander-redesign-local. Shared checkout has unrelated legal changes; preserve them.

## Proposed acceptance criteria

1. Hero retains HomeBackgroundVideo's existing looping sources, poster, viewport/document pause behavior, and reduced-motion handling. Use an inset rounded island matching Treat PDP tokens, lower-left modest headline and pill actions. Retain exactly 2.5vw bottom space outside the hero. Scope layout changes to the homepage; preserve header overlay readability and navigation.
2. Keep the existing Core product carousel and its canonical products, shared card purchasing behavior, touch/keyboard operation and preview descriptions. Use PDP-aligned rounded cards and consistent gutters.
3. Immediately after the Core carousel, add a server-rendered Super Serum product spotlight: model-led image, compact product identifier, restrained headline, short benefit explanation and native link to /products/super-serum. Render only when the canonical product exists; no hardcoded price, reviews, badges, efficacy timelines or substitute product. Use factual product data/current approved product education.
4. Generate the model image with built-in Image using the supplied male-model reference, after inspecting all five attachment pixels. Materialize the final generated asset into public/media/home with recorded provenance, actual dimensions, useful alt and responsive sizes. No placeholder or unseen-reference approximation counts as completion.
5. Restyle existing Plug and Play as rounded media/copy islands while keeping the existing 65/35 desktop split and video. Stack at mobile sizes. Preserve the functional Explore The Core anchor.
6. Preserve Beyond The Core functionality. Keep ingredient section markup, content and styles unchanged.
7. Move existing three-principles interactive section to the last content position before the footer. Match the provided Rhode reference with a rounded text island and portrait island, prominent value statement and three accessible choices. Retain hover, focus, touch/click, arrow/Home/End support, focus visibility and reduced motion. Avoid unrelated copy changes.
8. Remove the rendered Invest in your skin final-video section. Do not delete reusable video machinery or source media without need.

## Proposed verification

Inspect current and changed / plus /products/super-serum in @Browser at desktop 1440x900 and mobile 390x844; also inspect 768px tablet and 320px narrow overflow. Verify all section geometry and order, hero bottom spacing, rounded clipping, links, product rails, principles hover/touch/keyboard, header readability, reduced motion and video loading/failure poster handling. Preserve screenshots and bounded DOM measurements.

Use existing homepage-system-presets, home-background-video, home-three-principles, carousel and header tests. Update only stale layout assertions; add targeted observable proof for spotlight presence/absence and final section order/removal if it adds distinct coverage. Do not duplicate video unit tests. Run lint, typecheck and complete Vitest for a review candidate. Production build/browser gate remains necessary for integration, which is not authorized. Run codex-task prepare before committed-code review. Keep passed, failed and not-run outcomes separate.

## Current prerequisites and blockers

- Current executor exposes Library create/replace/upload tools but no Library list/search/read/prepare_materialize. Library skill and resolved-reference materialization guide loaded. Exact attachment IDs/names/sizes verified from trusted user_message_read history; bytes unavailable and pixels uninspected. No guessed storage URL or workspace scan for Library targets.
- Required layout references: libfile_2c473e93a3d0819195523207ecf4e329; libfile_bd5b07f383b081919a3426b39568c4ed; libfile_9b545b6d6f4c8191aba89b50e80e6f81; libfile_6482426626f08191b850f049071b7d27; libfile_8b48406f51448191b9e3cf9cbaf402bd. Which image is the model has not been established.
- Workflow requires independent Spec and Standards approval before local implementation, and published Spec/Tickets/Spec Branch before normal Spec Ticket implementation. Current branch is planning-only. The delegated local-only boundary is explicit, but must not silently bypass required setup; reviewers should identify whether implementation is blocked under this boundary.
- No matching repository-local skills in empty .agents or .codex/config.toml-only directory. Loaded Library and imagegen skills; imagegen not yet invoked because reference pixels are missing.

## Source observations

Live rhodeskin.com screenshot: inset hero with rounded clipping, overlay navigation, modest lower-left copy/pill. Near footer: separate rounded text and portrait panels with a three-choice values section. Live Smooche page read for content hierarchy only; its factual product claims, customer counts and promotions must not be imported. Existing Helix hero and principles/plug sections are full-width; principles precede plug. Existing Treat PDP uses --pdp-panel-radius:12px and storefront gutters max(16px,2.25vw). Ingredients section currently home-band home-section and must be preserved.
