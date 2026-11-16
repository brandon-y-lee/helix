import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminLoading from "@/app/admin/loading";
import { AdminAccessState } from "@/components/admin/shell/AdminAccessState";
import { FORMER_BRAND_PATTERN } from "@/tests/helpers/former-identifiers";

vi.mock("@/components/account/AccountForms", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

describe("admin fallback identity", () => {
  it.each([
    [
      "forbidden",
      <AdminAccessState key="forbidden" state="forbidden" />,
      "permission to access helix Admin",
    ],
    [
      "unavailable",
      <AdminAccessState key="unavailable" state="unavailable" />,
      "helix Admin permissions could not be verified",
    ],
    [
      "loading",
      <AdminLoading key="loading" />,
      "helix Admin permissions are being verified",
    ],
  ])("renders the canonical wordmark in the %s state", (_state, fallback, message) => {
    const { container } = render(fallback);
    const identity = container.querySelector(".admin-gate__eyebrow");

    expect(identity).toHaveAccessibleName("helix Admin");
    expect(
      identity?.querySelector('[data-helix-identity="wordmark"]'),
    ).toHaveAttribute("aria-hidden", "true");
    expect(identity).not.toHaveTextContent(FORMER_BRAND_PATTERN);
    expect(container).toHaveTextContent(message);
  });
});
