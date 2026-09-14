import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm, ProfileForm, ResetPasswordForm, SignInForm, SignUpForm } from "@/components/account/AccountForms";
import type { AccountFormAction } from "@/components/account/AccountForms";
import { PrivateFeedbackForm } from "@/components/account/PrivateFeedbackForm";

describe("isolated account form presentation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses a supplied local action without a provider request", async () => {
    const fetch = vi.fn(() => { throw new Error("Unexpected provider request"); });
    vi.stubGlobal("fetch", fetch);
    render(<ProfileForm firstName="Sample" lastName="Account" action={async () => ({
      status: "success",
      message: "Profile presentation updated locally.",
    })} />);
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("status"))
      .toHaveTextContent("Profile presentation updated locally.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["sign in", (action: AccountFormAction) => <SignInForm next="/account" action={action} />],
    ["sign up", (action: AccountFormAction) => <SignUpForm action={action} />],
    ["forgot password", (action: AccountFormAction) => <ForgotPasswordForm action={action} />],
    ["reset password", (action: AccountFormAction) => <ResetPasswordForm action={action} />],
  ] as const)("keeps %s validation local with the supplied action", async (_name, form) => {
    const fetch = vi.fn(() => { throw new Error("Unexpected provider request"); });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(form(async () => ({
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: { email: "Enter a valid email address.", password: "Use at least 8 characters." },
    })));
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the highlighted fields.");
    expect(container.querySelector('[aria-invalid="true"]')).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("submits synthetic private feedback without a provider request", async () => {
    const fetch = vi.fn(() => { throw new Error("Unexpected provider request"); });
    vi.stubGlobal("fetch", fetch);
    render(<PrivateFeedbackForm feedbackId="synthetic-feedback" orderNumber="SAMPLE-001"
      submitFeedback={async () => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Submit private feedback" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Private feedback submitted.");
    expect(fetch).not.toHaveBeenCalled();
  });
});
