# Separate routine browser verification from bounded Product Media verification

Routine Browser Verification remains a pull-request gate over live Storefront facts, but it uses the exact Product Media URL set from those facts to replace listed Product Media responses with small valid test media, fail when a real Product Media body escapes containment, and report the requests it contained. Real Product Media Verification separately checks every exact public Customer URL with one credential-free 32-byte range response, preserving Customer-path truth without making routine local or CI runs download full Product Media through cold caches.

## Consequences

- The Real Product Media Verification budget is dynamic: one 32-byte response for each distinct active Product Media URL. The check rejects an unapproved origin or path, a redirect that leaves the approved origin or path, and any response that exceeds the requested range; it also requires the Catalog media type, a matching media signature, a nonzero total object size, a positive public `max-age`, and no `private` or `no-store` cache directive.
- Real Product Media Verification is required before Publish and runs again after Publish, daily, and on manual request. A later failure alerts the operator and uses the Storefront media fallback without changing Catalog Status or other Catalog facts.
- Application-owned homepage media remains real during Routine Browser Verification. The gate does not repeat after an identical Git tree enters `dev` or `main`, and Production Artifact Verification retains the dedicated lifecycle ownership established by ADR-0001.
- Source Product Media optimization remains separate Customer-performance work.
