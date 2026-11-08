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

    fireEvent.keyDown(mission, { key: "End" });
    fireEvent.pointerEnter(innovation);
    expect(sustainability).toHaveFocus();
    expect(sustainability).toHaveAttribute("aria-pressed", "true");

    fireEvent.pointerMove(innovation);
    expect(innovation).toHaveAttribute("aria-pressed", "true");

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
});
