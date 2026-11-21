// @vitest-environment-options {"url":"https://helix-git-codex-558-verified-e87038-brandons-projects-5060bad5.vercel.app/"}
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WelcomePopup } from "@/components/marketing/WelcomePopup";
import { PRODUCTION_MARKETING_WORDING } from "@/lib/production-marketing/contract";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each(["development", "production"])("shows an inert mirror preview only for a development build (%s)", async (target) => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_HELIX_SUPABASE_TARGET", target);
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  render(<WelcomePopup />);
  await act(async () => { await vi.advanceTimersByTimeAsync(12001); });
  if (target === "development") {
    const box = screen.getByRole("checkbox", { name: PRODUCTION_MARKETING_WORDING });
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(/paused/i);
    fireEvent.submit(box.closest("form")!);
  } else {
    expect(screen.queryByRole("dialog")).toBeNull();
  }
  expect(network).not.toHaveBeenCalled();
});
