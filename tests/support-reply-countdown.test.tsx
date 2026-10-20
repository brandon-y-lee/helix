import { act, cleanup, render, screen } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplyCountdown } from "@/components/support/ReplyCountdown";

describe("reply countdown", () => {
  let hydratedRoot: Root | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T18:59:58Z"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  afterEach(() => {
    if (hydratedRoot) act(() => hydratedRoot?.unmount());
    hydratedRoot = undefined;
    cleanup();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders a clock-independent fallback on the server", () => {
    const now = vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("Server render read the clock"); });
    const markup = renderToString(<ReplyCountdown />);
    expect(markup).toContain("…");
    expect(markup).toContain("the next weekday reply target: noon Pacific");
    expect(markup).toContain("Monday–Friday at noon Pacific");
    expect(now).not.toHaveBeenCalled();
  });

  it("hydrates stale server HTML without a mismatch and then starts at the current time", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<ReplyCountdown />);
    const originalHeading = container.querySelector("h1");
    document.body.append(container);
    vi.setSystemTime(new Date("2026-10-19T18:00:00Z"));
    const recoverableError = vi.fn();

    await act(async () => {
      hydratedRoot = hydrateRoot(container, <ReplyCountdown />, { onRecoverableError: recoverableError });
    });

    expect(recoverableError).not.toHaveBeenCalled();
    expect(container.querySelector("h1")).toBe(originalHeading);
    expect(screen.queryByText("…")).not.toBeInTheDocument();
    expect(screen.getByText("01:00:00")).toBeInTheDocument();
    expect(screen.getByText("Monday, Oct 19 at noon Pacific")).toHaveAttribute("datetime", "2026-10-19T19:00:00.000Z");
  });

  it("ticks and immediately rolls from Friday noon to Monday without wrapping hours", () => {
    render(<ReplyCountdown />);
    expect(screen.getByText("00:00:02")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("00:00:01")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("72:00:00")).toBeInTheDocument();
    expect(screen.getByText("Monday, Oct 19 at noon Pacific")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("71:59:59")).toBeInTheDocument();
    expect(screen.queryByText("00:00:00")).not.toBeInTheDocument();
  });

  it("recomputes from the wall clock after a clock jump and on focus", () => {
    render(<ReplyCountdown />);
    vi.setSystemTime(new Date("2026-10-19T17:00:00Z"));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("01:59:59")).toBeInTheDocument();
    vi.setSystemTime(new Date("2026-10-19T18:00:00Z"));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(screen.getByText("01:00:00")).toBeInTheDocument();
  });

  it("resynchronizes when a background tab becomes visible", () => {
    render(<ReplyCountdown />);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    vi.setSystemTime(new Date("2026-10-19T18:00:00Z"));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("00:00:02")).toBeInTheDocument();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(screen.getByText("00:59:59")).toBeInTheDocument();
  });

  it("keeps one stable accessible heading and excludes ticking digits from announcements", () => {
    const { container } = render(<ReplyCountdown className="contact-countdown" />);
    const heading = screen.getByRole("heading", { level: 1, name: "We'll get back to you within the next weekday reply target: noon Pacific" });
    expect(heading).toHaveClass("contact-countdown");
    expect(screen.getByText("00:00:02")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("[aria-live], [role='timer'], [role='status']")).toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    expect(heading).toHaveAccessibleName("We'll get back to you within the next weekday reply target: noon Pacific");
  });

  it("clears its interval and listeners when unmounted", () => {
    const removeDocumentListener = vi.spyOn(document, "removeEventListener");
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<ReplyCountdown />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(removeDocumentListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith("focus", expect.any(Function));
  });
});
