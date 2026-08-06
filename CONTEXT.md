# Mei Pelle Commerce

Mei Pelle Commerce is the domain through which Customers understand The System, choose skincare, place Orders, and participate in Mei Pelle programs. This glossary defines the shared business language for the entire commerce platform.

## Brand

**Mei Pelle**:
The brand and organization offering The System and the Mei Pelle commerce experience.
_Avoid_: Mei-Pelle, mei-pelle, mei_pelle

## People

**Customer**:
A person who shops or purchases from Mei Pelle. A Customer may act as a Guest or Account Holder and need not have completed a purchase.
_Avoid_: User, Identity, Shopper

**Guest**:
A Customer who is not using an authenticated Mei Pelle account.
_Avoid_: Anonymous User

**Account Holder**:
A Customer using an authenticated Mei Pelle account. When email ownership affects eligibility, use the qualified phrase email-confirmed Account Holder.
_Avoid_: User, Member

## Skincare

**The System**:
Mei Pelle's fixed seven-role skincare architecture: CLEANSE, REFINE, TREAT, FRAME, SEAL, PROTECT, and LIFT.
_Avoid_: Method, Protocol, Routine

**System Step**:
A functional skincare role within The System. A System Step exists independently of any Product and may be fulfilled by no Product or multiple Products.
_Avoid_: Product, Routine Step

**System Position**:
The fixed ordinal assigned to a System Step, from 01 CLEANSE through 07 LIFT.
_Avoid_: Step Number, Product Number

**System Step Name**:
The canonical uppercase name of a System Step: CLEANSE, REFINE, TREAT, FRAME, SEAL, PROTECT, or LIFT. A bare System Step Name refers to the Step; use a complete Product name or Product Number when referring to a Product.
_Avoid_: Product Name

**Routine**:
A Customer-appropriate selection and schedule drawn from The System.
_Avoid_: System, Method

**Routine Position**:
The ordinal occupied by a System Step within a particular Routine, independent of its fixed System Position.
_Avoid_: Step Number, System Position

## Catalog

**Catalog**:
Mei Pelle's complete managed set of Products and their commercial facts, regardless of current publication or availability.
_Avoid_: Storefront, Collection

**Storefront**:
The Customer-facing subset of the Catalog presented for discovery or purchase.
_Avoid_: Catalog

**Product**:
An independently identifiable Mei Pelle skincare formulation represented in the Catalog. A Product may fulfill a System Step and exists independently of its current publication or availability.
_Avoid_: Item, System Step

**Product Source**:
The approved provenance for governed Product facts, including formulation and supplier information. It is distinct from editorial education and raw provider records.
_Avoid_: Editorial Copy, Raw Source

**Product Variant**:
A Product-specific purchasable configuration, such as a size or pack.
_Avoid_: Product, Item, SKU

**Product Offer**:
The current opportunity to purchase a Product Variant at a stated price. A Product may exist without a Product Offer.
_Avoid_: Product, Product Variant, Availability

**Catalog Status**:
The Storefront lifecycle state of a Product within the Catalog: draft, active, or archived.
_Avoid_: Status, Product Status, Availability

**Unpublished Product**:
A Product whose Catalog Status is draft.
_Avoid_: Draft, Draft Product, Catalog Draft

**Merchandising Status**:
The Storefront presentation of a Product's purchase readiness: available, coming soon, or sold out.
_Avoid_: Status, Product Status, Inventory Status

**Inventory Status**:
The stock condition of a Product Variant.
_Avoid_: Status, Merchandising Status, Availability

**Purchasable**:
The condition in which a valid Product Offer can be accepted now.
_Avoid_: Available, Active, In Stock

**Product Number**:
A stable merchandising identifier assigned to a Product, independent of System Position and Routine Position.
_Avoid_: Step Number, System Position, Routine Position

**Routine Group**:
The canonical classification of a Product as belonging to The Core or Beyond The Core.
_Avoid_: Collection, Category

**The Core**:
The foundational Routine Group for Products that fulfill CLEANSE, TREAT, and SEAL.
_Avoid_: Core Collection, FOUNDATION

**Beyond The Core**:
The Routine Group for Products that extend The Core. Its current members fulfill REFINE, FRAME, and LIFT.
_Avoid_: Beyond the Core, Beyond Core Collection

**Routine Complement**:
A directed recommendation from one Product to another Product that helps complete a Routine.
_Avoid_: Related Product, Complete the Routine Product

## Ingredients

**Complete INCI**:
A Product's complete ingredient declaration.
_Avoid_: Ingredient Highlights, Key Ingredients

**Key Ingredient**:
An ingredient selected for Customer education, not a substitute for Complete INCI.
_Avoid_: Complete INCI, Full Ingredients

**Formula Note**:
Explanatory context about a Product's formulation, not a substitute for Complete INCI.
_Avoid_: Complete INCI, Ingredient Declaration

## Catalog Operations

**Catalog Editor**:
A trusted operator who proposes Product presentation, education, media, and Routine Complement changes.
_Avoid_: Catalog Publisher, Catalog Administrator

**Catalog Publisher**:
A trusted operator who performs editorial work and may publish eligible Catalog Drafts.
_Avoid_: Catalog Editor, Catalog Administrator

**Catalog Administrator**:
A trusted operator who additionally governs commercial, supplier, Product Variant, Catalog Status, classification, and swatch facts.
_Avoid_: Admin, Catalog Editor, Catalog Publisher

**Catalog Draft**:
A complete proposed change to one Product and its governed Catalog facts. It is not Customer-visible.
_Avoid_: Draft Copy, Unpublished Product

**Working Catalog Draft**:
An editable Catalog Draft that has not completed review.
_Avoid_: Draft, Unpublished Product

**Ready Catalog Draft**:
A reviewed Catalog Draft eligible to be published.
_Avoid_: Ready, Published Revision

**Publish**:
The privileged act that makes a Ready Catalog Draft the canonical governed state of its Product. Publishing alone does not imply Storefront visibility or Purchasability.
_Avoid_: Publish Page, Activate Product

**Published Revision**:
An immutable historical snapshot of a Product produced when a Ready Catalog Draft is published.
_Avoid_: Catalog Draft, Product Version

**Restore**:
Create a new Working Catalog Draft from a Published Revision without rewriting history or immediately changing the Product.
_Avoid_: Revert, Roll Back

**Discard**:
Permanently close a Working or Ready Catalog Draft without changing the canonical Product.
_Avoid_: Delete Product, Archive Product

**Catalog Audit Entry**:
An immutable record of a governed Catalog action, distinct from application logs and provider payloads.
_Avoid_: Log Entry, Provider Event

## Cart and Checkout

**Cart**:
A Customer's current selection of Products and quantities for possible purchase. Guest and Account Holder describe who controls a Cart, not different kinds of Cart.
_Avoid_: Bag, Basket, Guest Cart, Authenticated Cart

**Cart Line**:
One Product configuration and quantity within a Cart.
_Avoid_: Cart Item, Line Item

**Checkout**:
The process of fixing the terms selected from a Cart, creating an Order, and seeking payment.
_Avoid_: Checkout Session, Order

**Payment Attempt**:
One effort to pay an Order. An Order may have more than one Payment Attempt.
_Avoid_: Checkout, Order, Checkout Session

## Orders

**Order**:
A fixed record of items, prices, adjustments, and purchase intent created when Checkout begins. An Order exists before payment and retains its historical terms.
_Avoid_: Transaction, Confirmed Order

**Order Line**:
The fixed Product, Product Variant, quantity, and agreed price recorded within an Order at Checkout.
_Avoid_: Order Item, Cart Line

**Pending Order**:
An Order awaiting verified payment.
_Avoid_: Draft Order, Confirmed Order

**Paid Order**:
An Order whose payment has been verified.
_Avoid_: Confirmed Order, Successful Checkout

**Payment-Failed Order**:
An Order whose Payment Attempts ended without verified payment.
_Avoid_: Failed Checkout, Cancelled Order

**Cancelled Order**:
An unpaid Order whose purchase intent was deliberately terminated or expired.
_Avoid_: Cancelled Checkout, Abandoned Checkout

**Refunded Order**:
A Paid Order whose full payment was returned to the Customer.
_Avoid_: Cancelled Order, Returned Order

## Feedback

**Private Feedback Eligibility**:
A Customer's right to submit Private Feedback about a qualifying Paid Order.
_Avoid_: Feedback Request, Review Request

**Private Feedback**:
A Customer's first-party, non-public response about an eligible Paid Order. It is distinct from a public Customer Review or Trustpilot review.
_Avoid_: Review, Rating, Trustpilot Review

## Rewards and Referrals

**MEI PELLE REWARDS**:
Mei Pelle's program through which email-confirmed Account Holders earn and use Points and referral benefits.
_Avoid_: Loyalty Program, Membership

**Reward**:
An umbrella term for a benefit offered or earned through MEI PELLE REWARDS. Use the precise benefit name whenever its type matters.
_Avoid_: Points, Discount

**Points**:
The non-cash units earned and used within MEI PELLE REWARDS.
_Avoid_: Rewards, Credit, Cash

**Points Ledger**:
The auditable history of every Points Award, Points Reservation, Points Redemption, Points Release, and Points Reversal for an Account Holder.
_Avoid_: Loyalty Ledger, Activity Feed

**Available Points Balance**:
The number of Points an Account Holder can currently use.
_Avoid_: Loyalty Balance, Lifetime Points

**Lifetime Points**:
The total Points positively awarded to an Account Holder over time, independent of current spendable value.
_Avoid_: Available Points Balance

**Points Award**:
Points added after an earning condition is satisfied.
_Avoid_: Points Credit, Reward

**Points Reservation**:
Points temporarily withheld from the Available Points Balance during Checkout.
_Avoid_: Points Redemption, Applied Points

**Points Redemption**:
Reserved Points permanently used when the associated Order becomes a Paid Order.
_Avoid_: Points Reservation, Applied Points

**Points Release**:
Reserved Points restored because Checkout did not produce a Paid Order.
_Avoid_: Points Reversal, Refund

**Points Reversal**:
An auditable offset of an earlier Points Award or Points Redemption that preserves the original history.
_Avoid_: Deletion, Points Release

**Redemption Tier**:
An exchange of a fixed number of Points for an Order discount.
_Avoid_: Reward Tier, Points Reward

**Referral Code**:
A non-identifying code associated with a referring Account Holder.
_Avoid_: User Code, Account ID

**Referral Attribution**:
The link between a referred Customer and the Account Holder identified by a Referral Code. Attribution alone guarantees neither a Referral Offer nor a Referral Reward.
_Avoid_: Referral Offer, Referral Reward

**Referral Offer**:
A discount offered to a referred Customer for a qualifying first Order.
_Avoid_: Referral Reward, Referral Discount

**Referral Reward**:
A discount entitlement earned by the referring Account Holder after the referred Customer completes a qualifying Paid Order.
_Avoid_: Referral Offer, Points
