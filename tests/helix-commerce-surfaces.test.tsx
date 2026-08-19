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
import { CookiePreferencesDialog } from "@/components/privacy/CookiePreferencesDialog";
import { COOKIE_ACKNOWLEDGEMENT_COOKIE } from "@/lib/customer-state-identifiers";

describe("helix Account, Cart, Checkout, and consent surfaces", () => {
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
      "Order confirmed | helix",
      "Checkout canceled | helix",
    ]);
  });

  it("presents truthful helix consent copy and writes the acknowledgement", () => {
    render(<CookiePreferencesDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Cookie Preferences" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "helix uses essential cookies",
    );
    expect(screen.getByRole("dialog")).not.toHaveTextContent("Mei Pelle");

    fireEvent.click(
      screen.getByRole("button", { name: "Save current preference" }),
    );
    expect(document.cookie).toContain(
      `${COOKIE_ACKNOWLEDGEMENT_COOKIE}=required-and-payment-functional`,
    );
  });
});
