"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SimulatedTrackingTimeline } from "@/components/cart/SimulatedTrackingTimeline";
import type {
  SimulatedOrderView, SimulatedShipmentCommand, SimulatedShipmentResult, SimulatedTrackingView,
} from "@/lib/tracking/types";
import styles from "./SimulatedTrackingConsole.module.css";

type Shipment = SimulatedTrackingView["shipments"][number];
type State = Shipment["state"];
type Command = SimulatedShipmentCommand;

export type SimulatedTrackingApi = {
  lookup: (orderNumber: string) => Promise<{ order: SimulatedOrderView | null }>;
  submit: (command: SimulatedShipmentCommand) => Promise<SimulatedShipmentResult>;
};

class RequestRejected extends Error {
  constructor(readonly status: number) { super("Request rejected before mutation"); }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(path, {
      method: "POST", credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal,
    });
    if ([400, 401, 403].includes(response.status)) throw new RequestRejected(response.status);
    if (!response.ok) throw new Error("Request unavailable");
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

const browserApi: SimulatedTrackingApi = {
  lookup: (orderNumber) => post("/api/admin/demo-orders/lookup", { orderNumber }),
  submit: (command) => post("/api/admin/demo-orders/events", command),
};

export function SimulatedTrackingConsole({ api = browserApi, simulationEnabled = true }: {
  api?: SimulatedTrackingApi;
  simulationEnabled?: boolean;
}) {
  const [orderNumber, setOrderNumber] = useState("");
  const [order, setOrder] = useState<SimulatedOrderView | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Command | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const errorPanel = useRef<HTMLDivElement>(null);

  useEffect(() => { if (error) errorPanel.current?.focus(); }, [error]);
  useEffect(() => { if (order && !pending && !error) resultHeading.current?.focus(); }, [order, pending, error]);

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || pending) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setOrder(null);
    setStatus("Looking up demo Order…");
    try {
      const result = await api.lookup(orderNumber.trim());
      setOrder(result.order);
      setStatus(result.order ? "Demo Order loaded." : "No matching demo Order is available.");
    } catch {
      setStatus("");
      setError("The demo Order could not be loaded. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function submit(command: Command) {
    if (busyRef.current || !simulationEnabled) return;
    const retryingUncertainEvent = pending !== null;
    busyRef.current = true;
    setBusy(true);
    setPending(command);
    setError("");
    setStatus("Recording simulated event…");
    try {
      const result = await api.submit(command);
      if (!["applied", "replayed", "conflict", "ineligible"].includes(result.status)) {
        throw new Error("Unknown event outcome");
      }
      setOrder(result.order);
      setPending(null);
      if (result.status === "applied") setStatus("Simulated event recorded. Email delivery is separate and may be queued or blocked.");
      if (result.status === "replayed") setStatus("This simulated event was already recorded. No duplicate event was created.");
      if (result.status === "conflict") setStatus("The Order changed before this event could be recorded. Review the latest details before trying a new action.");
      if (result.status === "ineligible") setStatus("This Order is not eligible for further simulation. No new event was recorded.");
    } catch (failure) {
      setStatus("");
      if (failure instanceof RequestRejected && !retryingUncertainEvent) {
        setPending(null);
        if (failure.status === 400) {
          setError("The event was not accepted. Check the quantities and resolution reason, then try again.");
        } else {
          setOrder(null);
          setError("Your access could not be confirmed. Sign in with an authorized account before trying again.");
        }
      } else if (failure instanceof RequestRejected) {
        // Rejecting this retry cannot establish whether its earlier attempt committed.
        setError("This retry was not accepted. The earlier event still needs confirmation; retry the same event when access is available.");
      } else {
        setError("The event outcome could not be confirmed. Retry the same event to check its result safely.");
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const locked = busy || pending !== null;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Development only</p>
        <h1>Demo orders</h1>
        <p>{simulationEnabled ? "Simulate" : "Review simulated"} tracking for a verified sandbox purchase. No real charge occurred. No goods will ship.</p>
      </header>
      {!simulationEnabled && <p className={styles.notice}>New simulated events are disabled. You can still look up demo Orders and read their history.</p>}
      <form className={styles.lookup} onSubmit={lookup}>
        <label className={styles.field}>
          <span>Order Number</span>
          <input className={styles.input} autoComplete="off" required maxLength={64}
            value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} disabled={locked} />
        </label>
        <button className={styles.button} type="submit" disabled={locked || !orderNumber.trim()}>Find demo Order</button>
      </form>
      <p className={styles.status} role="status" aria-live="polite">{status}</p>
      {error && (
        <div className={styles.error} role="alert" tabIndex={-1} ref={errorPanel}>
          <p>{error}</p>
          {pending && <button type="button" className={styles.button} disabled={busy || !simulationEnabled} onClick={() => submit(pending)}>Retry same event</button>}
        </div>
      )}
      {order && (
        <div className={styles.order} aria-busy={busy}>
          <h2 tabIndex={-1} ref={resultHeading}>Order {order.orderNumber}</h2>
          {!order.eligible || order.frozen ? (
            <p className={styles.notice}>This Order is not eligible for further simulation. Existing history is preserved.</p>
          ) : simulationEnabled ? (
            <>
              <DispatchForm key={`${order.orderId}:${order.lines.map((line) => line.allocatedQuantity).join(",")}`}
                order={order} disabled={locked} onSubmit={(lines) => submit({
                  orderId: order.orderId, commandId: crypto.randomUUID(), shipmentId: null,
                  expectedVersion: 0, state: "dispatched", lines, resolutionReason: null,
                })} />
              {order.shipments.filter((shipment) => shipment.state !== "delivered").map((shipment) => (
                <TransitionForm key={`${shipment.id}:${shipment.version}`} shipment={shipment} disabled={locked}
                  onSubmit={(state, resolutionReason) => submit({
                    orderId: order.orderId, commandId: crypto.randomUUID(), shipmentId: shipment.id,
                    expectedVersion: shipment.version, state, lines: [], resolutionReason,
                  })} />
              ))}
            </>
          ) : null}
          <SimulatedTrackingTimeline tracking={order} />
        </div>
      )}
    </div>
  );
}

function DispatchForm({ order, disabled, onSubmit }: {
  order: SimulatedOrderView;
  disabled: boolean;
  onSubmit: (lines: Command["lines"]) => void;
}) {
  const available = order.lines.filter((line) => line.quantity > line.allocatedQuantity);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  if (!available.length) return <p className={styles.notice}>All Order quantities have been allocated.</p>;
  const lines = available.map((line) => ({ orderItemId: line.id, quantity: Number(quantities[line.id] || 0) }))
    .filter((line) => line.quantity > 0);
  return (
    <form className={styles.panel} onSubmit={(event) => { event.preventDefault(); if (!disabled && lines.length) onSubmit(lines); }}>
      <h3>New simulated shipment</h3>
      <p>Select quantities from this Order. Previously allocated items cannot be dispatched again.</p>
      <fieldset disabled={disabled} className={styles.fields}>
        <legend className={styles.legend}>Shipment items</legend>
        {available.map((line) => {
          const label = `${line.name}${line.variantLabel ? ` · ${line.variantLabel}` : ""}`;
          return (
            <label className={styles.quantity} key={line.id}>
              <span>{label}<small>{line.quantity - line.allocatedQuantity} remaining of {line.quantity}</small></span>
              <input className={styles.input} type="number" min={0} max={line.quantity - line.allocatedQuantity} step={1}
                aria-label={`${label} quantity`} value={quantities[line.id] ?? "0"}
                onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} />
            </label>
          );
        })}
        <button className={styles.button} type="submit" disabled={!lines.length}>Simulate dispatch</button>
      </fieldset>
    </form>
  );
}

function TransitionForm({ shipment, disabled, onSubmit }: {
  shipment: Shipment;
  disabled: boolean;
  onSubmit: (state: State, resolutionReason: string | null) => void;
}) {
  const resolving = shipment.state === "exception";
  const [state, setState] = useState<State>(shipment.state === "in_transit" ? "delivered" : "in_transit");
  const [reason, setReason] = useState("");
  return (
    <form className={styles.panel} onSubmit={(event) => {
      event.preventDefault();
      if (!disabled && (!resolving || reason.trim())) onSubmit(state, resolving ? reason.trim() : null);
    }}>
      <h3>{resolving ? "Resolve exception" : "Update simulated tracking"} · Shipment {shipment.number}</h3>
      <fieldset className={styles.fields} disabled={disabled}>
        <legend className={styles.legend}>Next event for shipment {shipment.number}</legend>
        <label className={styles.field}>
          <span>Simulated status</span>
          <select className={styles.input} value={state} onChange={(event) => setState(event.target.value as State)}>
            {shipment.state !== "in_transit" && <option value="in_transit">In transit</option>}
            <option value="delivered">Delivered</option>
            {!resolving && <option value="exception">Exception</option>}
          </select>
        </label>
        {resolving && (
          <label className={styles.field}>
            <span>Resolution reason (internal only)</span>
            <input className={styles.input} type="text" required maxLength={500} value={reason}
              onChange={(event) => setReason(event.target.value)} />
          </label>
        )}
        <button className={styles.button} type="submit" disabled={resolving && !reason.trim()}>
          {resolving ? "Resolve simulated exception" : "Record simulated event"}
        </button>
      </fieldset>
    </form>
  );
}
