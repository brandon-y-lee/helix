import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home | Mei Pelle",
};

export default function HomePage() {
  return (
    <article>
      <h1>Home</h1>
      <p>Welcome to the Mei Pelle baseline application shell.</p>
    </article>
  );
}
