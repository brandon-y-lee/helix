"use client";
import { useRef, useState, type FormEvent } from "react";
import {
  allowedShipmentTransition,
  SHIPMENT_STATES,
  type ShipmentCommand,
  type ShipmentOrder,
} from "@/lib/shipments/contract";
import styles from "./SimulatedTrackingConsole.module.css";
export function ManualShipmentConsole({ enabled }: { enabled: boolean }) {
  const [number, setNumber] = useState(""),
    [order, setOrder] = useState<ShipmentOrder | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [carrier, setCarrier] = useState(""),
    [reference, setReference] = useState(""),
    [quantities, setQuantities] = useState<Record<string, string>>({});
  const [uncertain, setUncertain] = useState<ShipmentCommand | null>(null);
  const inFlight = useRef(false);
  async function request(body: unknown) {
    const response = await fetch("/api/admin/shipments", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return { response, data };
  }
  async function lookup(event?: FormEvent) {
    event?.preventDefault();
    if (inFlight.current || uncertain) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setOrder(null);
    setMessage("");
    try {
      const { response, data } = await request({ orderNumber: number });
      if (!response.ok) throw Error(data.error ?? "Lookup failed.");
      setOrder(data.order);
      setQuantities({});
      if (!data.order) setMessage("No matching sandbox order.");
    } catch {
      setError("Shipment lookup is unavailable. Try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function save(command: ShipmentCommand) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setUncertain(command);
    let confirmed = false;
    try {
      const { response, data } = await request(command);
      if (!response.ok) {
        if (response.status >= 500) throw Error("unknown");
        setUncertain(null);
        setError(
          "The update was not accepted. Reload the order and check its current state.",
        );
        return;
      }
      if (!["applied", "replayed"].includes(data.status))
        throw Error("unknown");
      confirmed = true;
      setUncertain(null);
      setMessage("Shipment record saved. No email was sent.");
      const latest = await request({
        orderNumber: order?.orderNumber ?? number,
      });
      if (latest.response.ok) setOrder(latest.data.order);
      else setOrder(null);
      setQuantities({});
    } catch {
      if (confirmed) {
        setOrder(null);
        setError(
          "The record was saved, but the view could not refresh. Find the order again.",
        );
      } else
        setError(
          "The result could not be confirmed. Retry the exact update before making another change.",
        );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    if (!order) return;
    const lines = order.lines.flatMap((l) =>
      Number(quantities[l.id]) > 0
        ? [{ orderItemId: l.id, quantity: Number(quantities[l.id]) }]
        : [],
    );
    if (!lines.length) {
      setError("Allocate at least one item.");
      return;
    }
    void save({
      commandId: crypto.randomUUID(),
      orderId: order.orderId,
      shipmentId: null,
      expectedVersion: 0,
      state: "preparing",
      carrier,
      trackingReference: reference,
      lines,
      correctionReason: null,
    });
  }
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1>Shipment records</h1>
        <p>
          Manually updated by helix. Not carrier-verified. No emails are
          triggered.
        </p>
        <p>Sandbox demo only. No goods will ship.</p>
        {!enabled && (
          <p>Updates are disabled. Existing records remain readable.</p>
        )}
      </header>
      <form onSubmit={lookup} className={styles.lookup}>
        <label className={styles.field}>
          Order number
          <input
            className={styles.input}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            maxLength={100}
            required
            disabled={busy || !!uncertain}
          />
        </label>
        <button className={styles.button} disabled={busy || !!uncertain}>
          Find order
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {uncertain && !busy && (
        <button className={styles.button} onClick={() => void save(uncertain)}>
          Retry exact update
        </button>
      )}
      {order && (
        <>
          <h2>{order.orderNumber}</h2>
          <form onSubmit={create}>
            <fieldset
              disabled={!enabled || busy || !!uncertain || !order.eligible}
            >
              <legend>Prepare a shipment</legend>
              <label className={styles.field}>
                Carrier (optional)
                <input
                  className={styles.input}
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  maxLength={100}
                />
              </label>
              <label className={styles.field}>
                Tracking reference (optional)
                <input
                  className={styles.input}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={200}
                />
              </label>
              {order.lines.map((l) => (
                <label key={l.id} className={styles.field}>
                  {l.name} · {l.quantity - l.allocatedQuantity} unallocated
                  <input
                    aria-label={`${l.name} quantity`}
                    className={styles.input}
                    type="number"
                    min={0}
                    max={l.quantity - l.allocatedQuantity}
                    step={1}
                    value={quantities[l.id] ?? "0"}
                    onChange={(e) =>
                      setQuantities({ ...quantities, [l.id]: e.target.value })
                    }
                  />
                </label>
              ))}
              <button className={styles.button}>Save preparing shipment</button>
            </fieldset>
          </form>
          {order.shipments.map((s) => (
            <form
              key={`${s.id}:${s.version}`}
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                void save({
                  commandId: crypto.randomUUID(),
                  orderId: order.orderId,
                  shipmentId: s.id,
                  expectedVersion: s.version,
                  state: values.get("state") as ShipmentCommand["state"],
                  carrier: String(values.get("carrier")),
                  trackingReference: String(values.get("reference")),
                  lines: [],
                  correctionReason:
                    String(values.get("reason") ?? "").trim() || null,
                });
              }}
            >
              <fieldset
                disabled={
                  !enabled || busy || !!uncertain || s.state === "cancelled"
                }
              >
                <legend>
                  Shipment · {s.state} · revision {s.version}
                </legend>
                <ul>
                  {s.items.map((i, n) => (
                    <li key={n}>
                      {i.name} · Qty {i.quantity}
                    </li>
                  ))}
                </ul>
                <label className={styles.field}>
                  Next status
                  <select name="state" className={styles.input}>
                    {SHIPMENT_STATES.filter((st) =>
                      allowedShipmentTransition(
                        s.state,
                        st,
                        "required correction",
                      ),
                    ).map((st) => (
                      <option key={st}>{st}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Carrier
                  <input
                    name="carrier"
                    className={styles.input}
                    defaultValue={s.carrier}
                    maxLength={100}
                  />
                </label>
                <label className={styles.field}>
                  Tracking reference
                  <input
                    name="reference"
                    className={styles.input}
                    defaultValue={s.trackingReference}
                    maxLength={200}
                  />
                </label>
                <label className={styles.field}>
                  Correction reason{" "}
                  {s.state === "delivered" ? "(required)" : "(optional)"}
                  <input
                    name="reason"
                    className={styles.input}
                    required={s.state === "delivered"}
                    maxLength={500}
                  />
                </label>
                <button className={styles.button}>Update manual record</button>
              </fieldset>
            </form>
          ))}
        </>
      )}
    </section>
  );
}
