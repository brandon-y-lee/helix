import type { ManualShipments } from "@/lib/shipments/contract";
export function ManualShipmentTimeline({
  records,
}: {
  records: ManualShipments;
}) {
  const shipments = records.environment === "sandbox" ? records.shipments :
    records.shipments.filter(shipment => shipment.dispatchedAt && shipment.state !== "preparing");
  if (!shipments.length) return null;
  return (
    <section
      className="checkout-result__panel"
      aria-label="Manual shipment records"
    >
      <h2>Shipment records</h2>
      <p>{records.environment === "live" ? "Helix records dispatch and delivery manually." : "Manually updated by helix. Not carrier-verified."}</p>
      {records.environment !== "live" && <p>Demo only. No goods will ship.</p>}
      {shipments.map((s, i) => (
        <section key={s.id}>
          <h3>
            Shipment {i + 1}: {s.state}
          </h3>
          {s.carrier && <p>Carrier: {s.carrier}</p>}
          {s.trackingReference && (
            <p>Tracking reference: {s.trackingReference}</p>
          )}
          <ul>
            {s.items.map((item, n) => (
              <li key={n}>
                {item.name} · Qty {item.quantity}
              </li>
            ))}
          </ul>
          {s.dispatchedAt && (
            <p>
              Dispatch recorded:{" "}
              <time dateTime={s.dispatchedAt}>
                {new Date(s.dispatchedAt).toLocaleDateString("en-US", {
                  timeZone: "UTC",
                })}
              </time>
            </p>
          )}
          {s.deliveredAt && (
            <p>
              Delivery recorded:{" "}
              <time dateTime={s.deliveredAt}>
                {new Date(s.deliveredAt).toLocaleDateString("en-US", {
                  timeZone: "UTC",
                })}
              </time>
            </p>
          )}
        </section>
      ))}
    </section>
  );
}
