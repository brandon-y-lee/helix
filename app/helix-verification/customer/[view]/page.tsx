import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerPresentationFixture } from "@/components/verification/CustomerPresentationFixture";
import { CUSTOMER_FIXTURE_FORMS, CUSTOMER_FIXTURE_STATES, CUSTOMER_FIXTURE_VIEWS, type CustomerFixtureForm, type CustomerFixtureState, type CustomerFixtureView } from "@/app/helix-verification/customer/presentation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Synthetic customer presentation verification | helix" };

export default async function CustomerVerificationPage({ params, searchParams }: {
  params: Promise<{ view: string }>;
  searchParams: Promise<{ state?: string; form?: string }>;
}) {
  if (process.env.VERCEL || process.env.HELIX_VERIFICATION_ADAPTER !== "1") notFound();
  const { view } = await params;
  const { state = "populated", form = "sign-in" } = await searchParams;
  if (!CUSTOMER_FIXTURE_VIEWS.includes(view as CustomerFixtureView)
    || !CUSTOMER_FIXTURE_STATES.includes(state as CustomerFixtureState)
    || !CUSTOMER_FIXTURE_FORMS.includes(form as CustomerFixtureForm)) notFound();
  return <CustomerPresentationFixture key={`${view}:${state}:${form}`} view={view as CustomerFixtureView} state={state as CustomerFixtureState} form={form as CustomerFixtureForm} />;
}
