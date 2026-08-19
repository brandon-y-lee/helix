import { HelixIdentity } from "@/components/brand/HelixIdentity";

export default function AdminLoading() {
  return (
    <main className="admin-gate" id="admin-content" aria-busy="true">
      <section className="admin-gate__panel" role="status" aria-live="polite">
        <div
          className="admin-gate__eyebrow"
          role="img"
          aria-label="helix Admin"
        >
          <HelixIdentity decorative />
          <span aria-hidden="true">ADMIN</span>
        </div>
        <h1>Checking access</h1>
        <p>Your session and admin permissions are being verified.</p>
      </section>
    </main>
  );
}
