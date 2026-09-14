import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogVerification } from "../CatalogVerification";
import { CATALOG_VERIFICATION_STATES, type CatalogVerificationState } from "../catalog-api";

export const metadata: Metadata = { title: "Admin catalog verification | helix", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EditorVerificationPage({ searchParams = Promise.resolve({}) }: {
  searchParams?: Promise<{ state?: string | string[] }>;
}) {
  if (process.env.VERCEL === "1" || process.env.HELIX_VERIFICATION_ADAPTER !== "1") notFound();
  const query = await searchParams;
  const state = query.state ?? "default";
  if (typeof state !== "string" || !CATALOG_VERIFICATION_STATES.includes(state as CatalogVerificationState)) notFound();
  return <CatalogVerification view="editor" state={state as CatalogVerificationState} />;
}
