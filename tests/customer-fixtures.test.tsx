import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerPresentationFixture } from "@/components/verification/CustomerPresentationFixture";
import { CUSTOMER_FIXTURE_FORMS } from "@/app/helix-verification/customer/presentation";

describe("customer verification fixture actions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(CUSTOMER_FIXTURE_FORMS)("keeps every %s action local", async (form) => {
    const fetch = vi.fn(() => { throw new Error("Provider request escaped fixture"); });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<CustomerPresentationFixture view="auth" state="validation" form={form} />);
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the highlighted fields.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps profile, sign-out and feedback actions inside the synthetic account", async () => {
    const fetch = vi.fn(() => { throw new Error("Provider request escaped fixture"); });
    vi.stubGlobal("fetch", fetch);
    render(<CustomerPresentationFixture view="account" state="success" form="sign-in" />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Profile updated.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Submit private feedback" }));
    expect(await screen.findByText("Private feedback submitted. 300 points were awarded.")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders native pending and disabled states without starting provider work", async () => {
    const fetch = vi.fn(() => { throw new Error("Provider request escaped fixture"); });
    vi.stubGlobal("fetch", fetch);
    render(<CustomerPresentationFixture view="account" state="pending" form="sign-in" />);
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Working" })).toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: "Submit private feedback" }));
    expect(screen.getByRole("button", { name: "Submitting" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
