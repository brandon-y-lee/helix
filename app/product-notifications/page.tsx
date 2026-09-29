import type { Metadata } from "next";
import { ProductNotifications } from "@/components/waitlist/ProductNotifications";
import styles from "@/components/waitlist/ProductNotifications.module.css";

export const metadata: Metadata = {
  title: "Product notifications | helix",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ProductNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { cancel } = await searchParams;
  if (
    cancel !== undefined &&
    (typeof cancel !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(cancel))
  ) {
    return (
      <div className="container">
        <section
          className={styles.panel}
          aria-labelledby="product-notifications-heading"
        >
          <p className="eyebrow">helix emails</p>
          <h1 id="product-notifications-heading">Product notifications</h1>
          <p className={styles.intro} role="alert">
            This cancellation link is invalid. Request new links to manage your
            Product notifications.
          </p>
          <p className={styles.note}>
            <a href="/product-notifications">Request new cancellation links</a>
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="container">
      <ProductNotifications key={cancel ?? "recovery"} cancelToken={cancel} />
    </div>
  );
}
