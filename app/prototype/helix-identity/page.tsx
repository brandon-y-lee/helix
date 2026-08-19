import { notFound } from "next/navigation";
import { HelixIdentityPrototype } from "@/components/prototype/HelixIdentityPrototype";

// PROTOTYPE — Three close Helix identity studies, switchable via ?variant=A|B|C.
export default async function HelixIdentityPrototypePage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const requestedVariant = (await searchParams).variant?.toUpperCase();
  const variant =
    requestedVariant === "B" || requestedVariant === "C"
      ? requestedVariant
      : "A";

  return <HelixIdentityPrototype variant={variant} />;
}
