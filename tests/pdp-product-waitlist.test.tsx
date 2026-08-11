import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const fetchMock = vi.fn();

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
        productId="123e4567-e89b-42d3-a456-426614174141"
        productKey="mineral-guard"
        productName="Mineral Guard"
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

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("Waitlist Product PDP enrollment", () => {
  it("replaces all purchase facts with one accessible waitlist action", async () => {
    const user = userEvent.setup();
    renderWaitlist();

    const trigger = screen.getAllByRole("button", {
      name: "Join the waitlist",
    })[0];
    expect(trigger).toBeEnabled();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText("Size")).not.toBeInTheDocument();
    expect(screen.queryByText("Installment messaging")).not.toBeInTheDocument();

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: "Join the Mineral Guard waitlist",
    });
    const email = within(dialog).getByRole("textbox", {
      name: "Email address",
    });
    const consent = within(dialog).getByRole("checkbox", {
      name: /marketing emails/i,
    });
    expect(email).toHaveFocus();
    expect(consent).not.toBeChecked();
    expect(document.body).toHaveAttribute("data-sheet-scroll-lock");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(document.body).not.toHaveAttribute("data-sheet-scroll-lock");
  });

  it("announces generic success and sends only the minimal choice", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          message: "Your Product waitlist enrollment is confirmed.",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    renderWaitlist();
    await user.click(
      screen.getAllByRole("button", { name: "Join the waitlist" })[0],
    );
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Email address" }),
      "Customer@Example.COM",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Join the waitlist" }),
    );

    expect(await within(dialog).findByRole("status")).toHaveTextContent(
      "You're on the waitlist for Mineral Guard.",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/product-waitlist",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          productId: "123e4567-e89b-42d3-a456-426614174141",
          email: "Customer@Example.COM",
          marketingConsent: false,
        }),
      }),
    );
  });

  it("retains the email after a recoverable error", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "waitlist_unavailable",
            message: "The waitlist is temporarily unavailable. Try again.",
          },
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    renderWaitlist();
    await user.click(
      screen.getAllByRole("button", { name: "Join the waitlist" })[0],
    );
    const dialog = screen.getByRole("dialog");
    const email = within(dialog).getByRole("textbox", {
      name: "Email address",
    });
    await user.type(email, "customer@example.com");
    await user.click(
      within(dialog).getByRole("button", { name: "Join the waitlist" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The waitlist is temporarily unavailable. Try again.",
    );
    expect(email).toHaveValue("customer@example.com");
  });

  it("restores focus to the sticky trigger that opened the same sheet", async () => {
    const user = userEvent.setup();
    renderWaitlist();
    const sticky = document.querySelector<HTMLButtonElement>(
      "[data-sticky-pdp-buy-button]",
    );
    expect(sticky).not.toBeNull();

    await user.click(sticky!);
    expect(
      screen.getByRole("dialog", { name: "Join the Mineral Guard waitlist" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(sticky).toHaveFocus());
  });
});
