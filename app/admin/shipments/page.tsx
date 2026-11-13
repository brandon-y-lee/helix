import { redirect } from "next/navigation";
import { checkAdminCapability } from "@/lib/admin/capabilities";
import { authRedirectParam } from "@/lib/auth/redirect";
import { ManualShipmentConsole } from "@/components/admin/ManualShipmentConsole";
export const metadata = { title: "Shipment records" };
export default async function ShipmentRecordsPage() {
  const access = await checkAdminCapability("fulfillment.manage");
  if (access.status === "unauthenticated")
    redirect(authRedirectParam("/admin/shipments"));
  if (access.status !== "allowed")
    return (
      <section>
        <h1>Shipment records unavailable</h1>
        <p>
          {access.status === "unavailable"
            ? "Permissions could not be checked. Try again."
            : "Your account cannot manage shipment records."}
        </p>
      </section>
    );
  return (
    <ManualShipmentConsole
      enabled={process.env.HELIX_MANUAL_SHIPMENTS_ENABLED === "true"}
    />
  );
}
