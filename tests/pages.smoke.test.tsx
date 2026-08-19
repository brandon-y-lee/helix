import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedProductCards: vi.fn(async () => []),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserForPublicPage: vi.fn(async () => null),
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn() }),
  };
});

import SignInPage from "@/app/account/sign-in/page";
import SignUpPage from "@/app/account/sign-up/page";
import ForgotPasswordPage from "@/app/account/forgot-password/page";
import ResetPasswordPage from "@/app/account/reset-password/page";
import CartPage from "@/app/cart/page";
import CollectionPage, {
  generateMetadata as generateCollectionMetadata,
} from "@/app/collections/[collection]/page";
import { CartProvider } from "@/components/cart/CartProvider";
import { getCurrentUserForPublicPage } from "@/lib/auth/session";

beforeEach(() => {
  vi.mocked(getCurrentUserForPublicPage).mockResolvedValue(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({ lines: [], count: 0, subtotal: 0, currency: "USD" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ),
  );
});

describe("public route states", () => {
  it("renders a clear Shop empty state", async () => {
    render(
      await CollectionPage({
        params: Promise.resolve({ collection: "shop" }),
      }),
    );

    const heroHeading = screen.getByRole("heading", {
      level: 1,
      name: "raise your baseline",
    });
    expect(heroHeading).toBeInTheDocument();
    expect(
      heroHeading.parentElement?.querySelector("img")?.getAttribute("src"),
    ).toContain("raise-your-baseline-hero.webp");
    expect(
      screen.getByRole("navigation", { name: "Shop collections" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop All" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByText(/no products are available in this collection/i),
    ).toBeInTheDocument();
    expect(
      await generateCollectionMetadata({
        params: Promise.resolve({ collection: "shop" }),
      }),
    ).toMatchObject({
      title: "Shop All | helix",
      openGraph: { siteName: "helix", url: "/collections/shop" },
    });
  });

  it("renders the Cart empty state inside its provider", async () => {
    render(
      <CartProvider>
        {await CartPage({ searchParams: Promise.resolve({}) })}
      </CartProvider>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Cart" })).toBeVisible();
    expect(await screen.findByText(/your cart is empty/i)).toBeVisible();
  });

  it("renders a generic checkout cancellation notice without order details", async () => {
    render(
      <CartProvider>
        {await CartPage({
          searchParams: Promise.resolve({ checkout: "cancelled" }),
        })}
      </CartProvider>,
    );

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(
      "Sandbox checkout was cancelled. Your cart is still here.",
    );
    expect(notice).not.toHaveTextContent(/order|session|payment intent/i);
  });

  it("renders the sign-in access experience without changing its auth contract", async () => {
    const { container } = render(
      await SignInPage({
        searchParams: Promise.resolve({
          next: "/rewards",
          error: "expired-link",
        }),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeVisible();
    expect(screen.queryByText("Account")).not.toBeInTheDocument();

    const globalError = screen.getByRole("alert");
    expect(globalError).toHaveTextContent(
      "This sign-in link expired. Request a new one and try again.",
    );

    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("placeholder", "Email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toBeRequired();
    expect(email).toHaveAttribute("aria-invalid", "false");

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("placeholder", "Password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(password).toBeRequired();
    expect(password).toHaveAttribute("aria-invalid", "false");
    expect(
      screen.queryByRole("button", { name: /show password/i }),
    ).not.toBeInTheDocument();

    const decorativeMessage = screen.getByText("Your skin. Your system.");
    expect(decorativeMessage.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(
      decorativeMessage.parentElement?.querySelector("img")?.getAttribute("src"),
    ).toContain("access-hero.webp");
    expect(
      screen
        .getByRole("heading", { level: 1, name: "Sign in" })
        .compareDocumentPosition(decorativeMessage) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      globalError.compareDocumentPosition(email) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(container.querySelector('input[name="next"]')).toHaveValue(
      "/rewards",
    );
    expect(screen.getByRole("link", { name: "Forgot password" })).toHaveAttribute(
      "href",
      "/account/forgot-password",
    );
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/account/sign-up",
    );
  });

  it("renders account creation in the shared access layout", async () => {
    const user = userEvent.setup();
    render(await SignUpPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Create Account" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "Create Account" }),
    ).toHaveClass("account-access-layout__heading--single-line");
    expect(screen.queryByText("Account")).not.toBeInTheDocument();

    const fields = [
      screen.getByLabelText("First name"),
      screen.getByLabelText("Last name"),
      screen.getByLabelText("Email"),
      screen.getByLabelText("Password"),
    ];

    expect(fields.map((field) => field.getAttribute("name"))).toEqual([
      "firstName",
      "lastName",
      "email",
      "password",
    ]);
    expect(fields.map((field) => field.getAttribute("placeholder"))).toEqual([
      "First name",
      "Last name",
      "Email",
      "Password",
    ]);
    expect(fields.map((field) => field.getAttribute("autocomplete"))).toEqual([
      "given-name",
      "family-name",
      "email",
      "new-password",
    ]);
    fields.slice(0, -1).forEach((field, index) => {
      expect(
        field.compareDocumentPosition(fields[index + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
    expect(fields[0]).not.toBeRequired();
    expect(fields[1]).not.toBeRequired();
    expect(fields[2]).toBeRequired();
    expect(fields[3]).toBeRequired();
    expect(fields[3]).toHaveAttribute("type", "password");
    expect(
      screen.queryByRole("button", { name: /show password/i }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("Your skin. Your system.").closest('[aria-hidden="true"]'),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "Sign in instead" })).toHaveAttribute(
      "href",
      "/account/sign-in",
    );

    const createAccount = screen.getByRole("button", { name: "Create account" });
    const signInInstead = screen.getByRole("link", { name: "Sign in instead" });
    await user.tab();
    expect(fields[0]).toHaveFocus();
    await user.tab();
    expect(fields[1]).toHaveFocus();
    await user.tab();
    expect(fields[2]).toHaveFocus();
    await user.tab();
    expect(fields[3]).toHaveFocus();
    await user.tab();
    expect(createAccount).toHaveFocus();
    await user.tab();
    expect(signInInstead).toHaveFocus();
  });

  it("renders password recovery in the shared access layout", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Reset password" }),
    ).toBeVisible();
    expect(screen.queryByText("Account")).not.toBeInTheDocument();

    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("placeholder", "Email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toBeRequired();
    expect(email).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
      "href",
      "/account/sign-in",
    );
    expect(
      screen.getByText("Your skin. Your system.").closest('[aria-hidden="true"]'),
    ).not.toBeNull();

    await user.tab();
    expect(email).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Send reset link" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveFocus();
  });

  it("keeps account-creation errors adjacent and globally announced", async () => {
    render(await SignUpPage());

    const form = screen.getByRole("button", { name: "Create account" }).closest("form");
    if (!form) throw new Error("Expected the account-creation form");
    fireEvent.submit(form);

    const alert = await screen.findByRole("alert");
    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    const emailError = screen.getByText("Email is required.");
    const passwordError = screen.getByText("Password is required.");

    expect(alert).toHaveTextContent("Check the highlighted fields.");
    expect(
      alert.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Email is required.");
    expect(email.parentElement?.lastElementChild).toBe(emailError);
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription("Password is required.");
    expect(password.parentElement?.lastElementChild).toBe(passwordError);
  });

  it("keeps recovery errors adjacent and globally announced", async () => {
    render(<ForgotPasswordPage />);

    const form = screen.getByRole("button", { name: "Send reset link" }).closest("form");
    if (!form) throw new Error("Expected the recovery form");
    fireEvent.submit(form);

    const alert = await screen.findByRole("alert");
    const email = screen.getByLabelText("Email");
    const emailError = screen.getByText("Email is required.");

    expect(alert).toHaveTextContent("Check the highlighted fields.");
    expect(
      alert.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Email is required.");
    expect(email.parentElement?.lastElementChild).toBe(emailError);
  });

  it("keeps reset-password visibility controls outside the access-page change", async () => {
    vi.mocked(getCurrentUserForPublicPage).mockResolvedValue({
      id: "account-holder",
    } as NonNullable<
      Awaited<ReturnType<typeof getCurrentUserForPublicPage>>
    >);

    render(await ResetPasswordPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Set new password" }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Show password" }),
    ).toHaveLength(2);
    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("associates sign-in field errors with their access fields", async () => {
    render(
      await SignInPage({
        searchParams: Promise.resolve({}),
      }),
    );

    const submit = screen.getByRole("button", { name: "Sign in" });
    const form = submit.closest("form");
    if (!form) throw new Error("Expected the sign-in form");

    fireEvent.submit(form);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check the highlighted fields.",
    );

    const email = screen.getByLabelText("Email");
    const emailError = screen.getByText("Email is required.");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Email is required.");
    expect(email).toHaveAttribute("aria-describedby", emailError.id);

    const password = screen.getByLabelText("Password");
    const passwordError = screen.getByText("Password is required.");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription("Password is required.");
    expect(password).toHaveAttribute("aria-describedby", passwordError.id);
  });
});
