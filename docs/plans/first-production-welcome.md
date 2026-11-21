# First production welcome email

## Customer outcome

A visitor explicitly selects welcome-only consent in the footer, popup or email preferences page. The visitor receives a confirmation, confirms ownership on the website and receives one welcome. A held Production artifact shows the same paused design. Existing subscribers, Accounts, orders and saved carts grant no new consent. Earlier preference and confirmation links keep their original destinations.

## Approved delivery choice

The owner chose direct email through the existing storefront and Resend's domain-scoped sending key for confirmation and welcome. Both use the monitored hello inbox as From and Reply-To. The welcome carries a pinned Topic, visible Helix withdrawal link and RFC 8058 headers. A signed and complete preference baseline, followed by continuous signed negative events, preserves known provider global and Topic opt-outs. A provider opt-out still in transit can race a direct handoff. One storefront schedule drives bounded, idempotent work. The admin can pause delivery and still process withdrawal and erase expired payloads.

Tickets #596–598 established explicit public consent and tested the two database predecessor shapes. Ticket #611 replaces the unshipped Automation/publisher design with sending-only delivery, preserves the old issued capabilities and uses the normal dev-to-main release workflow. The production owner controls the single callback cutover, live activation and public promotion. See the [implementation decision](https://github.com/brandon-y-lee/helix/issues/611) and the [activation and recovery procedure](../operations/production-marketing-readiness.md).
