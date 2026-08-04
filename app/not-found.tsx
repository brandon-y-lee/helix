import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found | Mei Pelle",
};

export default function NotFound() {
  return (
    <div className="container">
      <div className="page-head">
        <h1>Not found</h1>
      </div>
      <div className="empty-state">
        <p>
          We couldn&rsquo;t find that page or product. It may have moved or never
          existed.
        </p>
        <Link href="/collections/shop" className="btn">
          Browse the collection
        </Link>
      </div>
    </div>
  );
}
