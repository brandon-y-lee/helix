import { AdminHelixIdentity } from "@/components/admin/shell/AdminHelixIdentity";

export default function AdminLoading() {
  return (
    <main className="admin-gate" id="admin-content" aria-busy="true">
      <section className="admin-gate__panel" role="status" aria-live="polite">
        <AdminHelixIdentity
          className="admin-gate__eyebrow"
        />
        <h1>Checking access</h1>
        <p>Your session and helix Admin permissions are being verified.</p>
      </section>
    </main>
  );
}
