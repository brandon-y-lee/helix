import type { PaymentOperationsView as Operations } from "@/lib/admin/payments/types";
import { PaymentReplayAction } from "@/components/admin/payments/PaymentReplayAction";

function label(value: string) {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Timestamp({ value }: { value: string | null }) {
  if (!value) return <>Not recorded</>;
  return <time dateTime={value}>{new Date(value).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}</time>;
}

function age(seconds: number | null) {
  if (seconds === null) return "Not available";
  if (seconds < 60) return "Less than a minute";
  return `${Math.floor(seconds / 60)} minutes`;
}

export function PaymentOperationsView({ operations }: { operations: Operations }) {
  const { health, heartbeat, counts } = operations;
  return (
    <div className="payment-operations">
      <header className="admin-dashboard__header">
        <p className="admin-dashboard__eyebrow">Payment operations</p>
        <h1>Sandbox payments</h1>
        <p>Test activity only. No real charges, fulfillment, or customer messages.</p>
        <dl className="payment-operations__facts">
          <div><dt>Stripe account</dt><dd><code>{operations.accountId}</code></dd></div>
          <div><dt>Read at</dt><dd><Timestamp value={operations.observedAt} /></dd></div>
        </dl>
        <p className="payment-operations__note">This is a snapshot. Refresh to check current state. During supervised validation, check every five minutes and at the end.</p>
      </header>

      <section aria-labelledby="payment-health-title" className="payment-operations__section">
        <h2 id="payment-health-title">Recovery health</h2>
        {health.heartbeatStale && <p className="payment-operations__warning" role="status">Heartbeat stale: no completed worker run in the last five minutes. Hosted recovery is not confirmed.</p>}
        {health.overdue && <p className="payment-operations__warning">Pending work is older than 15 minutes and needs review.</p>}
        <dl className="payment-operations__metrics">
          <div><dt>Queued or processing</dt><dd>{health.queueDepth}</dd></div>
          <div><dt>Dead letters</dt><dd>{counts.dead_letter}</dd></div>
          <div><dt>Oldest pending</dt><dd>{age(health.oldestPendingAgeSeconds)}</dd></div>
        </dl>
        <dl className="payment-operations__facts">
          <div><dt>Last completed heartbeat</dt><dd><Timestamp value={heartbeat.completedAt} />{health.heartbeatAgeSeconds !== null && <> ({age(health.heartbeatAgeSeconds)} ago)</>}</dd></div>
          <div><dt>Last run started</dt><dd><Timestamp value={heartbeat.startedAt} /></dd></div>
          <div><dt>Last completed run</dt><dd>{heartbeat.completedAt ? <>{heartbeat.processedCount} processed · {heartbeat.failureCount} failures</> : "Not recorded"}</dd></div>
          <div><dt>Event counts</dt><dd>{counts.pending} pending · {counts.processing} processing · {counts.processed} processed · {counts.ignored} ignored</dd></div>
        </dl>
      </section>

      <section aria-labelledby="payment-events-title" className="payment-operations__section">
        <h2 id="payment-events-title">Events</h2>
        <p className="payment-operations__note">Up to 100 events, with unresolved work first. Replay queues an event for another recovery attempt; it does not confirm payment.</p>
        {operations.items.length === 0 ? <p>No events recorded.</p> : <ul className="payment-operations__list">
          {operations.items.slice(0, 100).map((item) => <li key={item.id}>
            <article className="payment-operations__card" aria-label={`Event ${item.eventId}`}>
              <h3><code>{item.eventId}</code></h3>
              <p>{label(item.state)} · {item.eventType}</p>
              <dl className="payment-operations__facts">
                <div><dt>Inbox item</dt><dd><code>{item.id}</code></dd></div>
                <div><dt>Provider object</dt><dd>{item.objectId ? <code>{item.objectId}</code> : "Not recorded"}</dd></div>
                <div><dt>Received</dt><dd><Timestamp value={item.receivedAt} /></dd></div>
                <div><dt>Attempts</dt><dd>{item.attempts} this cycle · {item.lifetimeAttempts} total</dd></div>
                <div><dt>Version</dt><dd>{item.version}</dd></div>
                <div><dt>Source</dt><dd>{label(item.provenance)}</dd></div>
                {item.state === "pending" && <div><dt>Next attempt due</dt><dd><Timestamp value={item.nextAttemptAt} /></dd></div>}
                {item.processedAt && <div><dt>Completed</dt><dd><Timestamp value={item.processedAt} /></dd></div>}
                {item.incidentCode && <div><dt>Current issue</dt><dd>{label(item.incidentCode)}</dd></div>}
              </dl>
              {item.replayEligible && <PaymentReplayAction itemId={item.id} version={item.version} />}
            </article>
          </li>)}
        </ul>}
      </section>

      <section aria-labelledby="payment-incidents-title" className="payment-operations__section">
        <h2 id="payment-incidents-title">Incidents</h2>
        <p className="payment-operations__note">Up to 100 incidents, with unresolved incidents first.</p>
        {operations.incidents.length === 0 ? <p>No incidents recorded.</p> : <ul className="payment-operations__list">
          {operations.incidents.slice(0, 100).map((incident) => <li key={incident.id} className="payment-operations__card">
            <h3>{label(incident.code)}</h3>
            <dl className="payment-operations__facts">
              <div><dt>Incident</dt><dd><code>{incident.id}</code></dd></div>
              <div><dt>Inbox item</dt><dd><code>{incident.itemId}</code></dd></div>
              <div><dt>Recorded</dt><dd><Timestamp value={incident.createdAt} /></dd></div>
              <div><dt>Resolution</dt><dd>{incident.resolvedAt ? <Timestamp value={incident.resolvedAt} /> : "Unresolved"}</dd></div>
            </dl>
          </li>)}
        </ul>}
      </section>

      <section aria-labelledby="payment-refunds-title" className="payment-operations__section">
        <h2 id="payment-refunds-title">Refund observations</h2>
        <p className="payment-operations__note">Up to 100 recent observations. Only a current succeeded status verifies a simulated return. Local refund reconciliation can remain unresolved.</p>
        {operations.refunds.length === 0 ? <p>No refund observations recorded.</p> : <ul className="payment-operations__list">
          {operations.refunds.slice(0, 100).map((refund) => <li key={refund.refundId}>
            <article className="payment-operations__card" aria-label={`Refund ${refund.refundId}`}>
              <h3><code>{refund.refundId}</code></h3>
              <p>{label(refund.status)}</p>
              <p>{refund.status === "succeeded" ? "Sandbox return verified" : "No returned money verified"}</p>
              {refund.succeededPreviously && refund.status !== "succeeded" && <p className="payment-operations__warning">Previously succeeded; current status changed and needs review.</p>}
              <dl className="payment-operations__facts">
                <div><dt>Amount</dt><dd>{refund.currency.toUpperCase()} {(refund.amountCents / 100).toFixed(2)}</dd></div>
                <div><dt>Charge</dt><dd><code>{refund.chargeId}</code></dd></div>
                <div><dt>Payment intent</dt><dd><code>{refund.paymentIntentId}</code></dd></div>
                <div><dt>Observed</dt><dd><Timestamp value={refund.observedAt} /></dd></div>
              </dl>
            </article>
          </li>)}
        </ul>}
      </section>
    </div>
  );
}
