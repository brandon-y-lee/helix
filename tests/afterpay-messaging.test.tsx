import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AfterpayMessaging,
  afterpayMessagingOptions,
} from "@/components/product-detail/AfterpayMessaging";

const stripeMocks = vi.hoisted(() => ({
  loadStripe: vi.fn(),
  messagingElement: vi.fn(),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: stripeMocks.loadStripe,
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stripe-elements">{children}</div>
  ),
  PaymentMethodMessagingElement: ({
    options,
  }: {
    options: Record<string, unknown>;
  }) => {
    stripeMocks.messagingElement(options);
    return <div data-testid="stripe-payment-method-message" />;
  },
}));

beforeEach(() => {
  stripeMocks.loadStripe.mockReset();
  stripeMocks.messagingElement.mockReset();
  stripeMocks.loadStripe.mockResolvedValue({ elements: vi.fn() });
});

describe("Afterpay payment-method messaging", () => {
  it("requests only Afterpay/Clearpay with integer minor units and USD", () => {
    expect(afterpayMessagingOptions(2500, "USD")).toEqual({
      amount: 2500,
      currency: "USD",
      logoColor: "black",
      paymentMethodOrder: ["afterpay_clearpay"],
      paymentMethodTypes: ["afterpay_clearpay"],
    });
  });

  it("mounts the official Stripe element and updates the selected amount", () => {
    const { rerender } = render(
      <AfterpayMessaging
        amount={2500}
        currency="USD"
        publishableKey="pk_test_first"
      />,
    );

    expect(screen.getByTestId("stripe-elements")).toBeInTheDocument();
    expect(screen.getByTestId("stripe-payment-method-message")).toBeInTheDocument();
    expect(stripeMocks.loadStripe).toHaveBeenCalledWith("pk_test_first");
    expect(stripeMocks.messagingElement).toHaveBeenLastCalledWith(
      expect.objectContaining({
        amount: 2500,
        currency: "USD",
        paymentMethodTypes: ["afterpay_clearpay"],
      }),
    );

    rerender(
      <AfterpayMessaging
        amount={4200}
        currency="USD"
        publishableKey="pk_test_first"
      />,
    );

    expect(stripeMocks.messagingElement).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: 4200 }),
    );
    expect(screen.queryByText(/four payments|interest-free|approved/i)).not.toBeInTheDocument();
  });

  it("fails closed for missing, live, zero, or invalid configuration", () => {
    const { rerender } = render(
      <AfterpayMessaging amount={2500} currency="USD" publishableKey={null} />,
    );
    expect(screen.queryByTestId("afterpay-messaging")).not.toBeInTheDocument();

    rerender(
      <AfterpayMessaging
        amount={2500}
        currency="USD"
        publishableKey="pk_live_blocked"
      />,
    );
    expect(screen.queryByTestId("afterpay-messaging")).not.toBeInTheDocument();

    rerender(
      <AfterpayMessaging amount={0} currency="USD" publishableKey="pk_test_zero" />,
    );
    expect(screen.queryByTestId("afterpay-messaging")).not.toBeInTheDocument();

    rerender(
      <AfterpayMessaging
        amount={25.5}
        currency="USD"
        publishableKey="pk_test_invalid"
      />,
    );
    expect(screen.queryByTestId("afterpay-messaging")).not.toBeInTheDocument();
    expect(stripeMocks.messagingElement).not.toHaveBeenCalled();
  });
});
