# Catalog & Discovery

Catalog & Discovery defines the Products Mei Pelle governs, how they become presentable and purchasable, and how Customers find and relate them.

## Language

**Catalog**:
Mei Pelle's complete managed set of Products and their commercial facts, regardless of current publication or availability.
_Avoid_: Storefront, Collection

**Product**:
An independently identifiable Mei Pelle skincare formulation represented in the Catalog. A Product may fulfill a System Step and exists independently of its current publication or availability.
_Avoid_: Item, System Step

**Product Source**:
The approved provenance for governed Product facts, including formulation and supplier information. It is distinct from editorial education and raw provider records.
_Avoid_: Editorial Copy, Raw Source

**Product Fact**:
A governed statement about a Product that is eligible to form part of its canonical Catalog state.
_Avoid_: Product Education, Product Claim, Supplier Fact

**Supplier Fact**:
A Product-related statement supplied through approved provenance and subject to Mei Pelle governance before becoming a Product Fact.
_Avoid_: Product Fact, Raw Supplier Record

**Product Education**:
Customer-facing explanation grounded in governed Product Facts and skincare concepts without itself becoming the underlying fact.
_Avoid_: Product Fact, Editorial Content, Product Claim

**Product Claim**:
An explicit representation about a Product's qualities, benefits, or expected performance that must be supportable by approved Product Facts.
_Avoid_: Product Education, Product Fact, Medical Claim

**Product Variant**:
A Product-specific purchasable configuration, such as a size or pack.
_Avoid_: Product, Item

**SKU**:
A commercial identifier assigned to a Product Variant.
_Avoid_: Product, Product Variant, Product Number

**Product Offer**:
The current opportunity to purchase a Product Variant at a stated price. A Product may exist without a Product Offer.
_Avoid_: Product, Product Variant, Availability

**Catalog Status**:
The Product lifecycle state within the Catalog: draft, active, or archived.
_Avoid_: Status, Product Status, Availability

**Draft Product**:
A Product whose Catalog Status is draft.
_Avoid_: Catalog Draft, Unpublished Product

**Active Product**:
A Product whose Catalog Status is active. Active does not by itself imply Purchasability.
_Avoid_: Available Product, Purchasable Product

**Archived Product**:
A Product whose Catalog Status is archived and is retained outside the Storefront lifecycle.
_Avoid_: Deleted Product, Unpublished Product

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

**Product Display Name**:
The short Product name used in Storefront presentation. It may match a System Step Name but refers to a Product only when Product context is explicit.
_Avoid_: System Step Name, Formal Product Title

**Formal Product Title**:
The complete Catalog name that identifies a Product beyond its Product Display Name.
_Avoid_: Product Display Name, System Step Name

**Product Type**:
A descriptive classification of a Product's form or purpose, independent of its System Step and Routine Group.
_Avoid_: System Step, Routine Group, Product Variant

**Product Media**:
Project-controlled visual or audiovisual material used to present a Product.
_Avoid_: Editorial Portrait, Raw Source

**Media Role**:
The intended presentation purpose assigned to Product Media.
_Avoid_: Product Media, Platform Surface

**Product Swatch**:
A project-controlled color treatment used to represent a Product when photographic Product Media is not used. It is not evidence of the Formula's actual color.
_Avoid_: Product Media, Formula Color

**Routine Group**:
The canonical classification of a Product as belonging to The Core or Beyond The Core.
_Avoid_: Collection, Category

**The Core**:
The foundational Routine Group for Products that fulfill CLEANSE, TREAT, and SEAL.
_Avoid_: Core Collection, FOUNDATION

**Beyond The Core**:
The Routine Group for Products that extend The Core. Its current members fulfill REFINE, FRAME, and LIFT.
_Avoid_: Beyond the Core, Beyond Core Collection

**Shop Collection**:
A Customer-facing discovery grouping of Products that may be derived from a Routine Group without becoming a canonical Product classification.
_Avoid_: Collection, Catalog, Routine Group

**Product Relationship**:
A directed association from one Product to another for a defined discovery or Routine purpose.
_Avoid_: Product Category, Routine Group

**Routine Complement**:
A Product Relationship that recommends another Product to help complete a Routine.
_Avoid_: Related Product, Routine Successor

**Related Product**:
A Product Relationship expressing broad editorial affinity without claiming Routine completion or sequence.
_Avoid_: Routine Complement, Routine Successor

**Routine Successor**:
A Product Relationship recommending the next Product in Routine order.
_Avoid_: Routine Complement, Related Product

**Product Discovery**:
The Customer activity of finding Products through browsing, Product Search, Shop Collections, or Product Relationships.
_Avoid_: Catalog, Product Search

**Product Search**:
A Product Discovery method that matches Customer-entered language against the Customer-visible Product catalog.
_Avoid_: Catalog Search, Provider Search, Search Index

**Catalog Editor**:
A trusted Operator who proposes Product presentation, education, media, and Product Relationship changes.
_Avoid_: Catalog Publisher, Catalog Administrator

**Catalog Publisher**:
A trusted Operator with Catalog Editor authority who may review and publish eligible Catalog Drafts.
_Avoid_: Catalog Editor, Catalog Administrator

**Catalog Administrator**:
A trusted Operator with Catalog Publisher authority who additionally governs commercial, supplier, Product Variant, Catalog Status, classification, and swatch facts.
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
