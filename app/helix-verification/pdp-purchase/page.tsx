import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PdpGalleryIsland } from "@/components/product-detail/PdpGalleryIsland";
import { PdpPurchaseIsland } from "@/components/product-detail/PdpPurchaseIsland";
import type { PdpPresentation } from "@/components/product-detail/pdp-presentation";

export const metadata: Metadata = {
  title: "PDP purchase verification | helix",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PdpPurchaseVerificationPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ presentation?: string | string[] }>;
}) {
  if (
    process.env.VERCEL === "1" ||
    process.env.HELIX_VERIFICATION_ADAPTER !== "1"
  ) {
    notFound();
  }

  const query = await searchParams;
  if (
    query.presentation !== undefined &&
    query.presentation !== "mobile-pilot" &&
    query.presentation !== "default"
  ) {
    notFound();
  }
  const presentation: PdpPresentation = query.presentation ?? "mobile-pilot";
  const productKey = "verification-pdp-purchase";

  return (
    <div
      className="storefront-shell"
      data-layout-shell="storefront"
      data-pdp-presentation={presentation}
    >
      <div className="pdp" data-pdp-primary-section>
        <PdpGalleryIsland
          productKey={productKey}
          detailMedia={null}
          items={[]}
          presentation={presentation}
        />
        <PdpPurchaseIsland
          productKey={productKey}
          productId={productKey}
          productName="Verification Serum"
          productType="Purchase control verification"
          productFamily={{
            id: "verification-family",
            slug: "verification-family",
            displayName: "Verification family",
            systemStepName: "TREAT",
            memberships: [{
              productId: productKey,
              slug: productKey,
              displayName: "Verification Serum",
              optionLabel: "Current option",
              status: "available",
              sortOrder: 0,
              isEntry: true,
              isCurrent: true,
            }],
          }}
          cartItem={{
            slug: productKey,
            name: "Verification Serum",
            swatch: ["#F5F5F7", "#F5F5F7"],
            imageUrl: null,
            imageAlt: null,
            placeholderMedia: null,
          }}
          currency="USD"
          routineLabel="Verification"
          stickyMedia={null}
          stripePublishableKey={null}
          unavailableLabel="Unavailable"
          variants={[
            { id: "verification-30ml", label: "30 mL", price: 3200, available: true, purchaseLabel: "Add to cart", purchasable: true },
            { id: "verification-60ml", label: "60 mL", price: 5400, available: true, purchaseLabel: "Add to cart", purchasable: true },
            { id: "verification-15ml", label: "15 mL", price: 1800, available: false, purchaseLabel: "Unavailable", purchasable: false },
          ]}
          showPrice
          showVariantOptions
          status="available"
          commerceDisabled
          presentation={presentation}
          accordions={null}
        >
          <p className="pdp__collection">Verification</p>
          <h1>Verification Serum</h1>
          <p className="pdp__tagline">Purchase control verification</p>
          <p className="pdp__description">
            Synthetic sizes for local interface verification. Purchases are disabled.
          </p>
        </PdpPurchaseIsland>
      </div>
      <span
        className="pdp-video-start-boundary"
        data-pdp-video-start
        aria-hidden="true"
      />
      {/* Keep the footer below the viewport while exercising sticky controls. */}
      <div aria-hidden="true" style={{ minHeight: "150vh" }} />
    </div>
  );
}
