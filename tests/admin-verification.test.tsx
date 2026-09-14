import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/helix-verification/admin",
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

vi.mock("@/app/account/actions", () => ({
  signOutAction: vi.fn(),
}));

import AdminVerificationPage from "@/app/helix-verification/admin/page";
import { signOutAction } from "@/app/account/actions";
import { AdminAccessState } from "@/components/admin/shell/AdminAccessState";
import { AdminShell } from "@/components/admin/shell/AdminShell";
import AdminStatesVerificationPage from "@/app/helix-verification/admin/states/page";

beforeEach(() => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "1");
  window.localStorage.clear();
  vi.mocked(signOutAction).mockClear();
});

afterEach(() => vi.unstubAllEnvs());

describe("Admin presentation verification", () => {
  it.each([undefined, "", "0", "true"])(
    "rejects ordinary execution without the adapter flag: %s",
    async (flag) => {
      vi.stubEnv("HELIX_VERIFICATION_ADAPTER", flag);
      await expect(AdminVerificationPage({})).rejects.toThrow("NOT_FOUND");
    },
  );

  it("rejects Vercel even when the local adapter is enabled", async () => {
    vi.stubEnv("VERCEL", "1");
    await expect(AdminVerificationPage({})).rejects.toThrow("NOT_FOUND");
  });

  it.each([
    { scenario: "unknown" },
    { scenario: "" },
    { scenario: ["default"] },
    { scenario: [] },
    { unsupported: "value" },
  ])("rejects unsupported dashboard queries: %j", async (query) => {
    await expect(AdminVerificationPage({
      searchParams: Promise.resolve(query),
    })).rejects.toThrow("NOT_FOUND");
  });

  it("renders actual module presentations in the gated dashboard", async () => {
    render(await AdminVerificationPage({}));

    expect(screen.getByRole("heading", { name: "Admin verification" })).toBeVisible();
    expect(screen.getByText("helix Admin", { exact: true })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Catalog Editor" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open module" })).toHaveAttribute(
      "href", "/admin/catalog",
    );
  });

  it("keeps synthetic sign-out controls local", async () => {
    const user = userEvent.setup();
    render(await AdminVerificationPage({}));

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(signOutAction).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sign out is disabled for synthetic verification.",
    );
  });

  it("preserves the production shell sign-out action by default", async () => {
    const user = userEvent.setup();
    render(<AdminShell accountLabel="Operator account" modules={[]}><h1>Admin overview</h1></AdminShell>);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(signOutAction).toHaveBeenCalledOnce();
  });

  it.each([
    ["empty", "No admin modules available"],
    ["unavailable", "Integration pending"],
  ])("renders the actual %s dashboard state", async (scenario, content) => {
    render(await AdminVerificationPage({ searchParams: Promise.resolve({ scenario }) }));

    expect(screen.getByText(content)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open module" })).toBeNull();
  });

  it("accepts a safe account control in access-state presentations", () => {
    render(<AdminAccessState
      state="forbidden"
      signOutControl={<button type="button">Local sign-out representation</button>}
    />);

    expect(screen.getByRole("button", { name: "Local sign-out representation" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("renders the actual forbidden state with a local sign-out control", async () => {
    const user = userEvent.setup();
    render(await AdminStatesVerificationPage({
      searchParams: Promise.resolve({ scenario: "forbidden" }),
    }));

    expect(screen.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOutAction).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sign out is disabled for synthetic verification.",
    );
  });

  it.each([
    ["unavailable", "Authorization unavailable"],
    ["loading", "Checking access"],
    ["error", "This module could not load"],
  ])("renders the actual %s restricted state", async (scenario, heading) => {
    render(await AdminStatesVerificationPage({ searchParams: Promise.resolve({ scenario }) }));

    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
  });

  it("keeps error recovery local and reports the verification outcome", async () => {
    const user = userEvent.setup();
    render(await AdminStatesVerificationPage({
      searchParams: Promise.resolve({ scenario: "error" }),
    }));

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Retry is disabled for synthetic verification.",
    );
  });

  it.each([undefined, "", "0", "true"])(
    "rejects restricted-state execution without the adapter flag: %s",
    async (flag) => {
      vi.stubEnv("HELIX_VERIFICATION_ADAPTER", flag);
      await expect(AdminStatesVerificationPage({})).rejects.toThrow("NOT_FOUND");
    },
  );

  it("rejects Vercel restricted-state requests even with the local adapter", async () => {
    vi.stubEnv("VERCEL", "1");
    await expect(AdminStatesVerificationPage({})).rejects.toThrow("NOT_FOUND");
  });

  it.each([
    { scenario: "unknown" },
    { scenario: "" },
    { scenario: ["forbidden"] },
    { scenario: [] },
    { unsupported: "value" },
  ])("rejects unsupported restricted-state queries: %j", async (query) => {
    await expect(AdminStatesVerificationPage({
      searchParams: Promise.resolve(query),
    })).rejects.toThrow("NOT_FOUND");
  });
});
