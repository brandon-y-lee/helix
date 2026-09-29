import type { Metadata } from "next";
import Link from "next/link";
import { EmailPreferences } from "@/components/marketing/EmailPreferences";
import styles from "@/components/marketing/EmailPreferences.module.css";

export const metadata: Metadata = {
  title: "Email preferences | helix",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function isToken(value: string | string[] | undefined): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2048;
}

export default async function EmailPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const confirmation = query.confirm;
  const withdrawal = query.unsubscribe;
  const invalidLink =
    (confirmation !== undefined && !isToken(confirmation)) ||
    (withdrawal !== undefined && !isToken(withdrawal)) ||
    (confirmation !== undefined && withdrawal !== undefined);

  return (
    <div className="container">
      {invalidLink ? (
        <section
          className={styles.panel}
          aria-labelledby="email-preferences-heading"
        >
          <p className="eyebrow">helix emails</p>
          <h1 id="email-preferences-heading">Email preferences</h1>
          <p className={styles.intro} role="alert">
            This email link is invalid. Use the link in your most recent helix
            email.
          </p>
          <p className={styles.note}>
            <Link href="/email-preferences">
              Request a new subscription link
            </Link>
          </p>
        </section>
      ) : (
        <EmailPreferences
          key={
            confirmation !== undefined
              ? `confirm:${confirmation}`
              : withdrawal !== undefined
                ? `unsubscribe:${withdrawal}`
                : "subscription"
          }
          confirmToken={isToken(confirmation) ? confirmation : undefined}
          unsubscribeToken={isToken(withdrawal) ? withdrawal : undefined}
        />
      )}
    </div>
  );
}
