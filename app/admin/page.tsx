import type { Metadata } from "next";
import Link from "next/link";
import { getAdminModules } from "@/lib/admin/modules";

export const metadata: Metadata = {
  title: "Overview",
};

export default function AdminPage() {
  const modules = getAdminModules();

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard__header">
        <p className="admin-dashboard__eyebrow">Internal operations</p>
        <h1>Admin overview</h1>
        <p>
          Open an available module to manage its part of the helix Platform.
        </p>
      </header>

      {modules.length === 0 ? (
        <section className="admin-dashboard__empty" role="status">
          <h2>No admin modules available</h2>
          <p>No internal tools are registered for this console.</p>
        </section>
      ) : (
        <section
          className="admin-dashboard__modules"
          aria-label="Admin modules"
        >
          {modules.map((module) => (
            <article
              key={module.id}
              className="admin-module"
              data-status={module.status}
            >
              <div className="admin-module__heading">
                <p>{module.status === "active" ? "Available" : "Unavailable"}</p>
                <h2>{module.label}</h2>
              </div>
              <p className="admin-module__description">
                {module.description}
              </p>
              <div className="admin-module__footer">
                {module.status === "active" ? (
                  <Link href={module.route} className="admin-module__link">
                    Open module
                  </Link>
                ) : (
                  <span className="admin-module__unavailable">
                    Integration pending
                  </span>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
