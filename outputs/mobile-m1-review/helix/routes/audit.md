# M1 cross-route shared-shell audit

Browser: Codex in-app Browser, 390 × 844. Local preview: http://127.0.0.1:3101.

Inspected routes: /collections/shop, /products/super-serum, /system, /about, /faq, /contact, /privacy, /account/sign-in. Each route was opened directly; its mobile header/top content was visually inspected and document/header/footer geometry recorded. Shared footer was additionally inspected at page bottom on Shop and sign-in.

## Result

No blocking M1 shell defect found across these eight routes. Every document and body measured 390 px wide. All routes render the consistent 64 px header (63 px inner bar plus border), 44 × 44 px Menu, Search and Cart controls, visible bag quantity, and centered wordmark without collision.

The footer consistently renders four visible navigation groups in two columns: 358 px total width, 171 px per column, 16 px gutters/gap, 44 px navigation link target heights. Navigation precedes service cards. Service cards measure 216 px total across three cards. The complete footer measures approximately 1339 px, with factual unavailable service/review/payment labels retained and utilities wrapping without overflow.

Offscreen descendants in Treat media/recommendation rails and System ingredient rail are deliberately clipped within their horizontal track containers; document width remains 390 px. These were not classified as document overflow.

## Follow-on ticket observations, not M1 regressions

FAQ still spends the first screen on the vertical category list; Privacy contents remain expanded; sign-in retains excessive vertical padding; System hero remains unusually tall. These are current body compositions assigned to M2–M5 and are not M1 shell blockers.

## Evidence

geometry.json contains all eight route measurements. Eight *-top.png captures show each route; shop-footer.png, sign-in-footer.png and sign-in-footer-navigation.png cover shared footer presentation. Development issue badge is local dev chrome and was not treated as a storefront defect.
