# Helix Context Map

Helix uses this map and nine owning `docs/domain/*/CONTEXT.md` glossaries; there is no root `CONTEXT.md`. Use this entry point for domain language.

## Authority and reading guide

The map owns routing, glossaries own vocabulary, ADRs own durable decisions, and approved Specs own task acceptance. Source and database contracts show implemented behavior; surface conflicts instead of using glossary text as implementation proof.

Choose the primary context from the table, then read only related contexts whose concepts the task crosses and relevant ADRs in `docs/adr/` or the owning context's `adr/` directory. Do not load all glossaries. Each term has one owner; cross-context references must not redefine it. One interaction may satisfy multiple concepts, such as a Privacy Request submitted as a Support Inquiry.

The glossaries are a maintained baseline, not an exhaustive dictionary. For vocabulary changes, follow [Domain maintenance](docs/agents/domain.md).

## Contexts

| Context | Owns | Read when | Does not own |
| --- | --- | --- | --- |
| [Brand & Platform](./docs/domain/brand-platform/CONTEXT.md) | helix, brand language, editorial posture, and platform surfaces | Naming the brand, a public or operator-facing surface, or platform-wide experience language | People, skincare concepts, catalog records, transactions, or policies |
| [People & Access](./docs/domain/people-access/CONTEXT.md) | Visitors, Customers, Accounts, Profiles, authentication states, Operators, and roles | Describing a person, account relationship, identity state, or platform authority | Customer transactions, rewards, or service cases |
| [Skincare](./docs/domain/skincare/CONTEXT.md) | The System, Routines, ingredients, concerns, formulation, and usage concepts | Describing skincare education, ingredient language, or how a Routine is composed | Catalog lifecycle, merchandising, or purchase state |
| [Catalog & Discovery](./docs/domain/catalog-discovery/CONTEXT.md) | Products, Variants, Offers, merchandising, catalog operations, media, search, navigation, and recommendations | Describing what helix presents, governs, publishes, finds, or offers | Skincare meaning, customer identity, or completed transaction facts |
| [Ordering & Payment](./docs/domain/ordering-payment/CONTEXT.md) | Carts, Checkout, Orders, monetary components, payment, cancellation, and refunds | Describing purchase intent, agreed terms, or payment state | Catalog governance, customer identity, fulfillment, or reward-program rules |
| [Rewards & Referrals](./docs/domain/rewards-referrals/CONTEXT.md) | helix rewards, Points, ledgers, referral attribution, offers, and benefits | Describing program eligibility, earning, redemption, or referral value | Customer identity or the underlying Order and payment state |
| [Feedback & Reputation](./docs/domain/feedback-reputation/CONTEXT.md) | Private feedback, customer reviews, ratings, third-party reviews, and endorsements | Describing first-party responses or public reputation signals | Order eligibility, Product facts, or support inquiries |
| [Service & Fulfillment](./docs/domain/service-fulfillment/CONTEXT.md) | Support, shipping, delivery, returns, exchanges, claims, and service status | Describing assistance after or around a purchase, fulfillment, or service availability | Orders, customer identity, or binding policy language |
| [Trust & Policy](./docs/domain/trust-policy/CONTEXT.md) | Legal documents, privacy, consent and preferences, Product Waitlist Enrollments, accessibility, and public factual-status language | Describing formal commitments, Customer notification choices, or truth-status of public information | Operational service cases, fulfillment actions, or brand positioning |
