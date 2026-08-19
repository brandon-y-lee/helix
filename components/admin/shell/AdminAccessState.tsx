import Link from "next/link";
import { SignOutButton } from "@/components/account/AccountForms";
import { HelixIdentity } from "@/components/brand/HelixIdentity";

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
        <div
          className="admin-gate__eyebrow"
          role="img"
          aria-label="helix Admin"
        >
          <HelixIdentity decorative />
          <span aria-hidden="true">ADMIN</span>
        </div>
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
