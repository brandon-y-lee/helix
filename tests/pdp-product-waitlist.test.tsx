import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/components/cart/useProductPurchase", () => ({
  useProductPurchase: () => ({
    error: "",
    pending: false,
    purchase: vi.fn(),
  }),
}));
vi.mock("@/components/product-detail/AfterpayMessaging", () => ({
  AfterpayMessaging: () => <div>Installment messaging</div>,
}));
vi.mock("@/components/product/ProductImage", () => ({
  ProductImage: () => <div data-testid="product-image" />,
}));

import { PdpPurchaseIsland } from "@/components/product-detail/PdpPurchaseIsland";

function renderWaitlist() {
  return render(
    <>
      <span data-pdp-video-start />
      <PdpPurchaseIsland
        accordions={<div>Product details</div>}
        cartItem={{
          slug: "mineral-guard",
          name: "Mineral Guard",
          swatch: ["#ddd8cf", "#8d887f"],
          imageUrl: null,
          imageAlt: null,
          placeholderMedia: null,
        }}
        currency="USD"
        productKey="mineral-guard"
        productName="Mineral Guard"
        productFamily={null}
        productType="Mineral facial sunscreen"
        routineLabel="Beyond The Core"
        status="waitlist"
        stickyMedia={null}
        stripePublishableKey={null}
        unavailableLabel="COMING SOON"
        variants={[]}
        showPrice={false}
        showVariantOptions={false}
      >
        <h1>Mineral Guard</h1>
      </PdpPurchaseIsland>
      <footer id="site-footer" />
    </>,
  );
}

it("shows a disabled coming-soon action for a Product with historical waitlist status", () => {
  renderWaitlist();

  for (const action of screen.getAllByRole("button", { name: "COMING SOON" })) {
    expect(action).toBeDisabled();
  }
  expect(screen.queryByRole("button", { name: /join the waitlist/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText("Installment messaging")).not.toBeInTheDocument();
});
