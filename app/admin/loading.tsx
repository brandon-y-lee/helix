export default function AdminLoading() {
  return (
    <main className="admin-gate" id="admin-content" aria-busy="true">
      <section className="admin-gate__panel" role="status" aria-live="polite">
        <p className="admin-gate__eyebrow">MEI PELLE ADMIN</p>
        <h1>Checking access</h1>
        <p>Your session and admin permissions are being verified.</p>
      </section>
    </main>
  );
}
