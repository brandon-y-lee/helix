# Ordering & Payment

Ordering & Payment defines purchase intent as it moves from a Customer's selection through fixed Order terms and verified payment outcomes.

## Language

**Price**:
The monetary amount stated for a Product Offer or fixed on an Order Line.
_Avoid_: Order Total, Product Offer

**Unit Price**:
The agreed Price of one unit of a Product Variant fixed on an Order Line.
_Avoid_: Price, Line Subtotal

**Line Subtotal**:
The Unit Price of an Order Line multiplied by its fixed quantity before Order-level adjustments.
_Avoid_: Unit Price, Merchandise Subtotal

**Merchandise Subtotal**:
The sum of Order Line quantities at their agreed Prices before Discounts, Shipping Charges, and Tax.
_Avoid_: Subtotal, Order Total

**Discount**:
A reduction applied to the Merchandise Subtotal under one eligible benefit or offer.
_Avoid_: Reward, Refund, Credit

**Shipping Charge**:
The amount charged on an Order for an eligible delivery service.
_Avoid_: Shipping Cost, Tax

**Tax**:
The government-imposed amount included in an Order's monetary terms.
_Avoid_: Shipping Charge, Fee

**Order Total**:
The final monetary amount owed for an Order after its Order Lines, Discount, Shipping Charge, and Tax are fixed.
_Avoid_: Merchandise Subtotal, Transaction Total

**Payment**:
The transfer of money that satisfies all or part of the amount owed for an Order.
_Avoid_: Payment Attempt, Order, Transaction

**Payment Status**:
The environment-qualified state reached by a Payment Attempt, including a simulated state reached through Sandbox Checkout.
_Avoid_: Order Status, Payment, Provider Status

**Payment Verification**:
Trusted confirmation that a Payment Attempt has reached its claimed Payment Status in the applicable Checkout environment.
_Avoid_: Checkout Success, Redirect Confirmation

**Refund**:
The return of all or part of a verified Payment while preserving the original Order facts.
_Avoid_: Discount, Cancellation, Points Reversal

**Cart**:
A Customer's current selection of Products and quantities for possible purchase. Guest and Account Holder describe who controls a Cart, not different kinds of Cart.
_Avoid_: Bag, Basket, Guest Cart, Authenticated Cart

**Cart Ownership**:
The relationship identifying the Customer or Account that controls a Cart.
_Avoid_: Guest Cart, Authenticated Cart

**Cart Merge**:
The operation that combines eligible Cart Lines under one resulting Cart Ownership, such as when a Guest signs into an Account that already controls a Cart.
_Avoid_: Cart Transfer, Cart Replacement

**Cart Line**:
One Product Variant and quantity within a Cart.
_Avoid_: Cart Item, Line Item

**Checkout**:
The process of fixing the terms selected from a Cart, creating an Order, and seeking payment.
_Avoid_: Checkout Session, Order

**Sandbox Checkout**:
Checkout operating in a test environment that may simulate payment states but cannot create real charges, fulfillment, or Customer communications.
_Avoid_: Live Checkout, Test Order

**Payment Attempt**:
One effort to pay an Order. An Order may have more than one Payment Attempt.
_Avoid_: Checkout, Order, Checkout Session

**Order**:
A fixed record of items, prices, adjustments, and purchase intent created when Checkout begins. An Order exists before payment and retains its historical terms.
_Avoid_: Transaction, Confirmed Order

**Order Number**:
A Customer-facing identifier assigned to an Order, distinct from internal provider or storage identifiers.
_Avoid_: Order ID, Payment Reference

**Sandbox Order**:
An Order created through Sandbox Checkout that records a payment simulation but is not a real purchase and cannot enter fulfillment.
_Avoid_: Test Order, Live Order

**Order Line**:
The fixed Product, Product Variant, quantity, and agreed price recorded within an Order at Checkout.
_Avoid_: Order Item, Cart Line

**Shipping Address**:
The destination address fixed on an Order for delivery-related use.
_Avoid_: Billing Address, Account Address

**Billing Address**:
The address fixed on an Order for payment-related use.
_Avoid_: Shipping Address, Account Address

**Pending Order**:
An Order awaiting verified payment.
_Avoid_: Draft Order, Confirmed Order

**Paid Order**:
An Order whose Payment Status has been authoritatively verified as paid for its Checkout environment. A paid Sandbox Order is not evidence that a real Payment occurred.
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
