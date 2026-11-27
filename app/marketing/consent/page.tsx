import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingConsentAction } from "@/components/marketing/MarketingConsentAction";
import { CAPABILITY } from "@/lib/marketing/contract";

export const metadata: Metadata = {
  title: "Email consent | helix",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function MarketingConsentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { confirm, unsubscribe, scope = "welcome" } = await searchParams;
  if (scope !== "welcome" && scope !== "lifecycle" && scope !== "lifecycle_reviews") notFound();
  if ((confirm === undefined) === (unsubscribe === undefined)) notFound();
  const token = confirm ?? unsubscribe;
  if (typeof token !== "string" || !CAPABILITY.test(token)) notFound();

  return (
    <div className="container">
      <MarketingConsentAction
        key={`${confirm ? "confirm" : "unsubscribe"}:${scope}:${token}`}
        action={confirm ? "confirm" : "unsubscribe"}
        token={token}
        scope={scope}
      />
    </div>
  );
}
