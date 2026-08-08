# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Delivery labels

These labels add artifact type and lifecycle state without changing the five canonical triage roles.

| Label | Meaning |
| --- | --- |
| `type:spec` | Approved delivery specification |
| `type:ticket` | Implementable vertical slice |
| `workflow:planned` | Approved spec decomposed into tickets |
| `workflow:in-progress` | Claimed work in progress |
| `workflow:review` | Implementation awaiting review or CI |
| `workflow:integration-queued` | Ready `dev` pull request awaiting the Integration Slot |
| `workflow:integration-active` | Current frozen Integration Slot owner |
| `workflow:urgent` | Human-approved active production or security urgency |

Automation may add the queued and active labels. Only the user may approve `workflow:urgent`; an agent or workflow must not infer it.

Wayfinder uses `wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, and `wayfinder:task`.
