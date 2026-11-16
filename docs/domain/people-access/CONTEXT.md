# People & Access

People & Access defines the people who interact with helix, their relationship to an Account, and the authority under which they act.

## Language

**Visitor**:
A person accessing or seeking to interact with the Public Site, whether or not that person is a Customer.
_Avoid_: Customer, User, Guest

**Customer**:
A person who shops or purchases from helix. A Customer may act as a Guest or Account Holder and need not have completed a purchase.
_Avoid_: User, Member, Shopper

**Guest**:
A Customer who is not using an authenticated helix Account.
_Avoid_: Anonymous User

**Account Holder**:
A Customer who controls a helix Account, regardless of whether the Customer is currently signed in.
_Avoid_: User, Member

**Signed-in Account Holder**:
An Account Holder whose authority over an Account is authenticated for the current interaction.
_Avoid_: Account Holder, Email-confirmed Account Holder

**Email-confirmed Account Holder**:
An Account Holder whose control of the Account email address has been confirmed.
_Avoid_: Signed-in Account Holder, Verified Customer

**Account**:
The persistent helix relationship through which an Account Holder accesses private Customer information and account-specific capabilities.
_Avoid_: Account Holder, Profile, Identity

**Profile**:
The Customer-provided personal information associated with an Account.
_Avoid_: Account, Identity

**Operator**:
A person authorized to use Admin under one or more platform roles.
_Avoid_: Admin, User, Customer

**Operator Role**:
A named bundle of authority assigned to an Operator.
_Avoid_: Operator, Operator Capability

**Operator Capability**:
One platform action an Operator is authorized to perform.
_Avoid_: Operator Role, Permission
