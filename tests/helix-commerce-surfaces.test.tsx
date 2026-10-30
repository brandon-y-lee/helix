import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { metadata as accountMetadata } from "@/app/account/page";
import { metadata as signInMetadata } from "@/app/account/sign-in/page";
import { metadata as signUpMetadata } from "@/app/account/sign-up/page";
import { metadata as forgotPasswordMetadata } from "@/app/account/forgot-password/page";
import { metadata as resetPasswordMetadata } from "@/app/account/reset-password/page";
import { metadata as unavailableMetadata } from "@/app/account/service-unavailable/page";
import { metadata as cartMetadata } from "@/app/cart/page";
import { metadata as checkoutMetadata } from "@/app/checkout/page";
import { metadata as successMetadata } from "@/app/checkout/success/page";
import { PrivacyChoicesDialog } from "@/components/privacy/PrivacyChoicesDialog";
import { FORMER_BRAND_PATTERN } from "@/tests/helpers/former-identifiers";

describe("helix Account, Cart, Checkout, and privacy surfaces", () => {
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
    ]).toEqual([
      "Account | helix",
      "Sign in | helix",
      "Create account | helix",
      "Reset password | helix",
      "Set new password | helix",
      "Account unavailable | helix",
      "Cart | helix",
      "Checkout | helix",
      "Order status | helix",
    ]);
  });

  it("presents scoped privacy choices without persisting a dismissal", () => {
    const cookies = vi.spyOn(document, "cookie", "set");
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const initialUrl = window.location.href;
    try {
      render(<PrivacyChoicesDialog />);
      fireEvent.click(screen.getByRole("button", { name: "Your Privacy Choices" }));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("Helix Labs LLC DBA Helix");
      expect(dialog).toHaveTextContent("Your choices are stored in this browser");
      expect(dialog).not.toHaveTextContent(FORMER_BRAND_PATTERN);
      expect(screen.getAllByRole("switch")).toHaveLength(2);
      expect(screen.getByRole("button", { name: "Accept All" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Close privacy choices" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(window.location.href).toBe(initialUrl);
      expect(cookies).not.toHaveBeenCalled();
      expect(storage).not.toHaveBeenCalled();
    } finally { cookies.mockRestore(); storage.mockRestore(); }
  });
});
