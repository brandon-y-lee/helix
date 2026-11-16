import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SimulatedTrackingConsole } from "@/components/admin/SimulatedTrackingConsole";
import { ADMIN_CAPABILITIES, checkAdminCapability } from "@/lib/admin/capabilities";
import { authRedirectParam } from "@/lib/auth/redirect";
import { isOrderSimulationEnabled, isOrderSimulationEnvironmentAllowed } from "@/lib/tracking/config";

export const metadata: Metadata = { title: "Demo orders" };

export default async function DemoOrdersPage() {
  const access = await checkAdminCapability(ADMIN_CAPABILITIES.ordersSimulate);
  if (access.status === "unauthenticated") redirect(authRedirectParam("/admin/demo-orders"));
  if (access.status !== "allowed") {
    return (
      <section className="admin-error" role={access.status === "unavailable" ? "alert" : undefined}>
        <h1>Demo orders unavailable</h1>
        <p>{access.status === "unavailable"
          ? "Your permissions could not be verified. Try again shortly."
          : "Your account does not have permission to simulate shipments."}</p>
      </section>
    );
  }
  if (!isOrderSimulationEnvironmentAllowed()) {
    return (
      <section className="admin-error">
        <h1>Demo orders</h1>
        <p>This environment is not enabled for demo-order tracking.</p>
      </section>
    );
  }
  return <SimulatedTrackingConsole simulationEnabled={isOrderSimulationEnabled()} />;
}
