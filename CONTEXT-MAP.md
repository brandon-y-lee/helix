# Mei Pelle Context Map

This map routes agents to the canonical project-specific language for the Mei Pelle platform. The glossaries form a maintained baseline rather than an exhaustive dictionary; a future task may add a justified term through domain modeling once its meaning is resolved.

## Reading Guide

Read this map first, then read the primary context for the task and only the related contexts whose concepts the task actually crosses. Every term has exactly one owning context; related contexts may reference it but must not redefine it. One real interaction may satisfy terms from multiple contexts, such as a Privacy Request submitted as a Support Inquiry.

Define an individual value from a finite platform vocabulary only when it has non-obvious, stable meaning that agents must distinguish. Glossaries are not mirrors of schemas, provider objects, routes, or implementation identifiers.

## Contexts

| Context | Owns | Read when | Does not own |
| --- | --- | --- | --- |
| [Brand & Platform](./docs/domain/brand-platform/CONTEXT.md) | Mei Pelle, brand language, editorial posture, and platform surfaces | Naming the brand, a public or operator-facing surface, or platform-wide experience language | People, skincare concepts, catalog records, transactions, or policies |
| [People & Access](./docs/domain/people-access/CONTEXT.md) | Visitors, Customers, Accounts, Profiles, authentication states, Operators, and roles | Describing a person, account relationship, identity state, or platform authority | Customer transactions, rewards, or service cases |
| [Skincare](./docs/domain/skincare/CONTEXT.md) | The System, Routines, ingredients, concerns, formulation, and usage concepts | Describing skincare education, ingredient language, or how a Routine is composed | Catalog lifecycle, merchandising, or purchase state |
| [Catalog & Discovery](./docs/domain/catalog-discovery/CONTEXT.md) | Products, Variants, Offers, merchandising, catalog operations, media, search, navigation, and recommendations | Describing what Mei Pelle presents, governs, publishes, finds, or offers | Skincare meaning, customer identity, or completed transaction facts |
| [Ordering & Payment](./docs/domain/ordering-payment/CONTEXT.md) | Carts, Checkout, Orders, monetary components, payment, cancellation, and refunds | Describing purchase intent, agreed terms, or payment state | Catalog governance, customer identity, fulfillment, or reward-program rules |
| [Rewards & Referrals](./docs/domain/rewards-referrals/CONTEXT.md) | MEI PELLE REWARDS, Points, ledgers, referral attribution, offers, and benefits | Describing program eligibility, earning, redemption, or referral value | Customer identity or the underlying Order and payment state |
| [Feedback & Reputation](./docs/domain/feedback-reputation/CONTEXT.md) | Private feedback, customer reviews, ratings, third-party reviews, and endorsements | Describing first-party responses or public reputation signals | Order eligibility, Product facts, or support inquiries |
| [Service & Fulfillment](./docs/domain/service-fulfillment/CONTEXT.md) | Support, shipping, delivery, returns, exchanges, claims, and service status | Describing assistance after or around a purchase, fulfillment, or service availability | Orders, customer identity, or binding policy language |
| [Trust & Policy](./docs/domain/trust-policy/CONTEXT.md) | Legal documents, privacy, consent and preferences, accessibility, and public factual-status language | Describing Mei Pelle's formal commitments, customer choices, or truth-status of public information | Operational service cases, fulfillment actions, or brand positioning |

## Relationships

- **People & Access → Ordering & Payment**: Ordering references the Customer or Account Holder who controls a Cart or places an Order.
- **People & Access → Rewards & Referrals**: Program eligibility and balances belong to an Account Holder without redefining that person.
- **Skincare → Catalog & Discovery**: Catalog Products may fulfill System Steps and carry skincare education, while Skincare owns the meaning of those concepts.
- **Catalog & Discovery → Brand & Platform**: Catalog and discovery experiences appear through platform surfaces owned by Brand & Platform.
- **Ordering & Payment → Catalog & Discovery**: Cart Lines and Order Lines reference Product Variants and preserve accepted Product Offers.
- **Rewards & Referrals → Ordering & Payment**: earning, reservation, redemption, and referral qualification depend on Order and payment facts.
- **Feedback & Reputation → People & Access, Catalog & Discovery, and Ordering & Payment**: feedback and reviews connect a person to a Product or qualifying Order without taking ownership of those concepts.
- **Service & Fulfillment → People & Access and Ordering & Payment**: service may assist a Visitor or Customer, and fulfillment may concern a Customer and Order.
- **Trust & Policy → Brand & Platform, People & Access, and Service & Fulfillment**: policies govern platform commitments, customer choices, and service representations without owning their operational execution.
- **Trust & Policy → Catalog & Discovery**: a Product Waitlist Enrollment records a Product-specific notification choice without changing the Product's Catalog, merchandising, inventory, or Product Offer state.
