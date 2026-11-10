import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeThreePrinciples } from "@/components/home/HomeThreePrinciples";
import { homeThreePrinciples } from "@/lib/content/home";

describe("HomeThreePrinciples input changes", () => {
  it("preserves keyboard and focus selection through reflow, then resumes deliberate hover and touch selection", () => {
    render(<HomeThreePrinciples headingId="principles" principles={homeThreePrinciples} />);
    const mission = screen.getByRole("button", { name: "mission" });
    const innovation = screen.getByRole("button", { name: "innovation" });
    const sustainability = screen.getByRole("button", { name: "sustainability" });
    expect(screen.getByRole("link", { name: "Our mission" })).toHaveAttribute("href", "/about#about-men-heading");

    fireEvent.keyDown(mission, { key: "End" });
    fireEvent.pointerEnter(innovation);
    expect(sustainability).toHaveFocus();
    expect(sustainability).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Our approach" })).toHaveAttribute("href", "/about#sustainability-heading");
    expect(screen.queryByRole("link", { name: "Our mission" })).not.toBeInTheDocument();

    fireEvent.pointerMove(innovation);
    expect(innovation).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Our formulation" })).toHaveAttribute("href", "/about#quality-heading");

    fireEvent.focus(mission);
    fireEvent.pointerEnter(sustainability);
    expect(mission).toHaveAttribute("aria-pressed", "true");

    fireEvent.pointerDown(sustainability);
    fireEvent.click(sustainability, { detail: 1 });
    expect(sustainability).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerEnter(innovation);
    expect(innovation).toHaveAttribute("aria-pressed", "true");

    fireEvent.focus(mission);
    fireEvent.keyDown(mission, { key: "Enter" });
    fireEvent.click(mission, { detail: 0 });
    fireEvent.pointerEnter(innovation);
    expect(mission).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the current selection through touch focus and a canceled vertical drag, then selects on tap", () => {
    render(<HomeThreePrinciples headingId="principles" principles={homeThreePrinciples} />);
    const mission = screen.getByRole("button", { name: "mission" });
    const innovation = screen.getByRole("button", { name: "innovation" });
    const touch = (type: string) => {
      const event = new MouseEvent(type, { bubbles: true });
      Object.defineProperty(event, "pointerType", { value: "touch" });
      return event;
    };

    fireEvent(innovation, touch("pointerdown"));
    fireEvent.focus(innovation);
    fireEvent(innovation, touch("pointermove"));
    fireEvent(innovation, touch("pointercancel"));
    expect(mission).toHaveAttribute("aria-pressed", "true");

    fireEvent(innovation, touch("pointerdown"));
    fireEvent.focus(innovation);
    fireEvent(innovation, touch("pointerup"));
    fireEvent.click(innovation, { detail: 1 });
    expect(innovation).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Our formulation" })).toBeInTheDocument();
  });

  it("moves focus from an outgoing CTA to the newly selected control before hiding its panel", () => {
    render(<HomeThreePrinciples headingId="principles" principles={homeThreePrinciples} />);
    const outgoing = screen.getByRole("link", { name: "Our mission" });
    const innovation = screen.getByRole("button", { name: "innovation" });
    outgoing.focus();
    fireEvent.pointerMove(innovation);

    expect(innovation).toHaveFocus();
    expect(innovation).toHaveAttribute("aria-pressed", "true");
    expect(outgoing.parentElement).toHaveAttribute("inert");
    expect(outgoing.parentElement).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("link", { name: "Our mission" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Our formulation" }).parentElement).toHaveAttribute("id", innovation.getAttribute("aria-controls"));
  });
});
