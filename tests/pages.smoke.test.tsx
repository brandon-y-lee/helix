import { fireEvent, render, screen } from "@testing-library/react";
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

describe("storefront route states", () => {
  it("renders a clear Shop empty state", async () => {
    render(
      await CollectionPage({
        params: Promise.resolve({ collection: "shop" }),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "raise your baseline" }),
    ).toBeInTheDocument();
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
    ).toEqual({ title: "Shop All | Mei Pelle" });
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
