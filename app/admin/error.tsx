"use client";

import Link from "next/link";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <section className="admin-error" role="alert">
      <p className="admin-dashboard__eyebrow">helix Admin</p>
      <h1>This module could not load</h1>
      <p>
        The requested admin view is unavailable. No changes were made.
      </p>
      <div className="admin-error__actions">
        <button type="button" onClick={reset}>
          Try again
        </button>
        <Link href="/admin">Return to overview</Link>
      </div>
    </section>
  );
}
