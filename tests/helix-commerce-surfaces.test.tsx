import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { metadata as accountMetadata } from "@/app/account/page";
import { metadata as signInMetadata } from "@/app/account/sign-in/page";
import { metadata as signUpMetadata } from "@/app/account/sign-up/page";
import { metadata as forgotPasswordMetadata } from "@/app/account/forgot-password/page";
import { metadata as resetPasswordMetadata } from "@/app/account/reset-password/page";
import { metadata as unavailableMetadata } from "@/app/account/service-unavailable/page";
import { metadata as cartMetadata } from "@/app/cart/page";
import { metadata as checkoutMetadata } from "@/app/checkout/page";
import { metadata as successMetadata } from "@/app/checkout/success/page";
import { metadata as cancelMetadata } from "@/app/checkout/cancel/page";
import { CookieAcknowledgementDialog } from "@/components/privacy/CookieAcknowledgementDialog";
import { COOKIE_ACKNOWLEDGEMENT_COOKIE } from "@/lib/customer-state-identifiers";
import { FORMER_BRAND_PATTERN } from "@/tests/helpers/former-identifiers";

describe("helix Account, Cart, Checkout, and acknowledgement surfaces", () => {
  it("uses the approved brand casing in route metadata", () => {
    expect([
      accountMetadata.title,
      signInMetadata.title,
      signUpMetadata.title,
      forgotPasswordMetadata.title,
      resetPasswordMetadata.title,
      unavailableMetadata.title,
      cartMetadata.title,
      checkoutMetadata.title,
      successMetadata.title,
      cancelMetadata.title,
    ]).toEqual([
      "Account | helix",
      "Sign in | helix",
      "Create account | helix",
      "Reset password | helix",
      "Set new password | helix",
      "Account unavailable | helix",
      "Cart | helix",
      "Checkout | helix",
      "Payment verified | helix",
      "Checkout canceled | helix",
    ]);
  });

  it("presents truthful helix acknowledgement copy and writes its record", () => {
    render(<CookieAcknowledgementDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Cookie notice" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "The helix Platform uses essential cookies",
    );
    expect(screen.getByRole("dialog")).not.toHaveTextContent(
      FORMER_BRAND_PATTERN,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Acknowledge notice" }),
    );
    expect(document.cookie).toContain(
      `${COOKIE_ACKNOWLEDGEMENT_COOKIE}=required-and-payment-functional`,
    );
  });
});
