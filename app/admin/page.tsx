import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin | Mei Pelle",
};

export default function AdminPage() {
  return (
    <article className="admin-page">
      <h1>Admin</h1>
      <p>Admin placeholder.</p>
    </article>
  );
}
