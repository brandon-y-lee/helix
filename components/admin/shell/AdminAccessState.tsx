import Link from "next/link";
import { SignOutButton } from "@/components/account/AccountForms";

export function AdminAccessState({
  state,
}: {
  state: "forbidden" | "unavailable";
}) {
  const forbidden = state === "forbidden";

  return (
    <main className="admin-gate" id="admin-content">
      <section
        className="admin-gate__panel"
        role={forbidden ? undefined : "alert"}
      >
        <p className="admin-gate__eyebrow">MEI PELLE ADMIN</p>
        <h1>{forbidden ? "Access denied" : "Authorization unavailable"}</h1>
        <p>
          {forbidden
            ? "Your account is signed in but does not have permission to access this console."
            : "Admin permissions could not be verified. Access remains closed until authorization is available."}
        </p>
        <div className="admin-gate__actions">
          <Link href="/" className="admin-gate__link">
            Return to storefront
          </Link>
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
