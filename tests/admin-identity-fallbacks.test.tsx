import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminLoading from "@/app/admin/loading";
import { AdminAccessState } from "@/components/admin/shell/AdminAccessState";

vi.mock("@/components/account/AccountForms", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

describe("admin fallback identity", () => {
  it.each([
    ["forbidden", <AdminAccessState key="forbidden" state="forbidden" />],
    ["unavailable", <AdminAccessState key="unavailable" state="unavailable" />],
    ["loading", <AdminLoading key="loading" />],
  ])("renders the canonical wordmark in the %s state", (_state, fallback) => {
    const { container } = render(fallback);
    const identity = container.querySelector(".admin-gate__eyebrow");

    expect(identity).toHaveAccessibleName("helix Admin");
    expect(
      identity?.querySelector('[data-helix-identity="wordmark"]'),
    ).toHaveAttribute("aria-hidden", "true");
    expect(identity).not.toHaveTextContent("MEI PELLE");
  });
});
