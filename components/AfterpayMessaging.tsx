"use client";

import { useMemo, useState } from "react";
import {
  Elements,
  PaymentMethodMessagingElement,
} from "@stripe/react-stripe-js";
import {
  loadStripe,
  type Stripe,
  type StripePaymentMethodMessagingElementOptions,
} from "@stripe/stripe-js";

type SupportedMessagingCurrency = "USD";

let stripeClientKey: string | null = null;
let stripeClientPromise: PromiseLike<Stripe | null> | null = null;

function stripeForPublishableKey(publishableKey: string) {
  if (stripeClientKey !== publishableKey || !stripeClientPromise) {
    stripeClientKey = publishableKey;
    stripeClientPromise = loadStripe(publishableKey).catch(() => null);
  }
  return stripeClientPromise;
}

export function afterpayMessagingOptions(
  amount: number,
  currency: SupportedMessagingCurrency,
): StripePaymentMethodMessagingElementOptions {
  return {
    amount,
    currency,
    paymentMethodTypes: ["afterpay_clearpay"],
    paymentMethodOrder: ["afterpay_clearpay"],
    logoColor: "black",
  };
}

export function AfterpayMessaging({
  amount,
  currency,
  publishableKey,
}: {
  amount: number;
  currency: SupportedMessagingCurrency;
  publishableKey: string | null;
}) {
  const [readyKey, setReadyKey] = useState("");
  const messageKey = `${currency}:${amount}`;
  const stripe = useMemo(
    () =>
      publishableKey?.startsWith("pk_test_")
        ? stripeForPublishableKey(publishableKey)
        : null,
    [publishableKey],
  );

  if (!stripe || !Number.isSafeInteger(amount) || amount <= 0) return null;

  return (
    <div
      className="pdp-payment-message"
      data-ready={readyKey === messageKey}
      data-testid="afterpay-messaging"
    >
      <Elements
        stripe={stripe}
        options={{
          appearance: {
            variables: {
              colorText: "#111312",
              fontFamily: "Manrope, Arial, sans-serif",
              fontSizeBase: "14px",
              spacingUnit: "4px",
            },
          },
        }}
      >
        <PaymentMethodMessagingElement
          key={messageKey}
          options={afterpayMessagingOptions(amount, currency)}
          onReady={() => setReadyKey(messageKey)}
        />
      </Elements>
    </div>
  );
}
