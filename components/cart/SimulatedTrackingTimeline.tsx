import type { SimulatedTrackingView } from "@/lib/tracking/types";
import styles from "./SimulatedTrackingTimeline.module.css";

const stateLabels = {
  dispatched: "Dispatched",
  in_transit: "In transit",
  delivered: "Delivered",
  exception: "Exception",
} as const;

const eventTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
});

export function SimulatedTrackingTimeline({ tracking }: { tracking: SimulatedTrackingView }) {
  return (
    <section className={`checkout-result__panel ${styles.timeline}`} aria-label="Simulated tracking">
      <h2>Simulated tracking</h2>
      <p className={styles.notice}>Demo only. No goods will ship. Carrier events are simulated.</p>
      {tracking.frozen && <p className={styles.notice}>Further simulation is frozen. Previous events remain below.</p>}
      {tracking.shipments.length === 0 && <p>No simulated shipments have been recorded.</p>}
      {tracking.shipments.map((shipment) => (
        <section className={styles.shipment} key={shipment.id} aria-label={`Simulated shipment ${shipment.number}`}>
          <div className={styles.heading}>
            <h3>Simulated shipment {shipment.number}</h3>
            <span className={styles.state}>{stateLabels[shipment.state]}</span>
          </div>
          <ul className={styles.items} aria-label={`Shipment ${shipment.number} items`}>
            {shipment.items.map((item, index) => (
              <li key={index}>{item.name}{item.variantLabel ? ` · ${item.variantLabel}` : ""} · Qty {item.quantity}</li>
            ))}
          </ul>
          <ol className={styles.events} aria-label={`Shipment ${shipment.number} events`}>
            {shipment.events.map((event, index) => (
              <li key={index}>
                <span>{stateLabels[event.state]}</span>
                <time dateTime={event.occurredAt}>{eventTime.format(new Date(event.occurredAt))} UTC</time>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </section>
  );
}
